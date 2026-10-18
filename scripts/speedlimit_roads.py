"""Prepare offline road geometry and auditable statutory speed limits.

Requires isolated tooling: beautifulsoup4==4.14.3, pyshp==3.0.3, pyproj==3.7.2.
Set PYTHONPATH to tmp/roadtools after installing these there with uv pip.
Inputs are official snapshots in ignored tmp/. Use --publish to emit the app's
network.mjs constant. Partial/estate rules stay unresolved unless explicitly
mapped in sites/speedlimit/data/verified-road-sections.json.
"""
from collections import Counter, defaultdict, deque
import argparse
from pathlib import Path
import hashlib
import io
import json
import re
import xml.etree.ElementTree as ET
import zipfile

from bs4 import BeautifulSoup
from pyproj import Transformer
import shapefile

ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / "tmp"
LIMITS = {1: 30, 2: 40, 3: 60, 4: 70, 5: 80, 6: 90}


def normalize(text):
    return " ".join(text.upper().replace("\u2011", "-").replace("\xa0", " ").split())


def road_names(path):
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    names = {}
    with zipfile.ZipFile(path) as archive:
        strings = ["".join(item.itertext()) for item in ET.fromstring(
            archive.read("xl/sharedStrings.xml")).findall("s:si", ns)]
        for name in archive.namelist():
            if not re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name):
                continue
            for row in ET.fromstring(archive.read(name)).findall(".//s:row", ns):
                cells = {}
                for cell in row.findall("s:c", ns):
                    value = cell.find("s:v", ns)
                    value = value.text if value is not None else ""
                    cells[re.sub(r"\d", "", cell.get("r"))] = (
                        strings[int(value)] if cell.get("t") == "s" and value else value)
                code, label = cells.get("E", ""), cells.get("I", "")
                if re.fullmatch(r"[A-Z]{3}\d{2}[A-Z]", code) and label:
                    names[code] = normalize(label)
    return names


def legal_rules(names):
    # A road mentioned inside an estate part must NOT be treated as a whole-road
    # limit. Likewise, clauses with lamp posts or directional limits stay explicit.
    lookup = sorted(set(names.values()), key=len, reverse=True)
    rules = []
    for number, limit in LIMITS.items():
        raw = (TMP / f"speed-schedule-{number}.html").read_bytes()
        soup = BeautifulSoup(raw.decode("utf-8"), "html.parser")
        schedule = soup.select_one("div.schedule")
        if schedule is None or not schedule.find(id=f"Sc{number}-"):
            raise ValueError(f"Schedule {number} missing from source")
        for group in schedule.select("td.sGrptbl"):
            rows = [row for row in group.select("tr[id]")
                    if row.find_parent("td", class_="sGrptbl") == group
                    and row.get("id", "").count("-tr-") == 1]
            entries = []
            for row in rows:
                text = " ".join(row.get_text(" ", strip=True).split())
                if re.match(r"^\(\s*[a-z]\s*\)", text) and entries:
                    entries[-1][1] += " " + text
                else:
                    entries.append([row["id"], text])
            context = None
            # The first table is Part 1, the remaining tables have estate/area
            # headings. Keep this context instead of flattening it away.
            if number == 2 and "S2-oc1-ta-" not in group.get("id", ""):
                context = entries.pop(0)[1] if entries else None
            for identity, text in entries:
                if "Deleted by" in text:
                    continue
                normalized = normalize(text)
                primary = next((label for label in lookup if
                                normalized == label + "." or
                                normalized.startswith(label + " ")), None)
                kind = ("estate" if context else "whole" if primary and
                        normalized.rstrip(".") == primary else "partial")
                rules.append({"id": identity, "limit": limit, "road": primary,
                              "scope": kind, "context": context, "description": text,
                              "source": f"https://sso.agc.gov.sg/SL/RTA1961-N6?ProvIds=Sc{number}-"})
    return rules


def geometry(path, names):
    with zipfile.ZipFile(path) as archive:
        get = lambda suffix: io.BytesIO(archive.read(next(
            name for name in archive.namelist() if name.lower().endswith(suffix))))
        reader = shapefile.Reader(shp=get(".shp"), dbf=get(".dbf"))
        # Explicit SVY21 -> WGS84 conversion, not an approximate metres/degree
        # formula. Preserve every original vertex, rounded to seven decimals.
        to_gps = Transformer.from_crs("EPSG:3414", "EPSG:4326", always_xy=True)
        result = []
        for identity, item in enumerate(reader.iterShapeRecords()):
            code = item.record["RD_CD"]
            points = [[round(x, 7), round(y, 7)] for x, y in
                      to_gps.itransform(item.shape.points)]
            offsets = list(item.shape.parts) + [len(points)]
            for start, end in zip(offsets, offsets[1:]):
                result.append({"id": identity, "roadCode": code,
                               "name": names.get(code), "points": points[start:end]})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    names = road_names(TMP / "road-codes.xlsx")
    roads = geometry(TMP / "RoadSectionLine_Sep2026.zip", names)
    rules = legal_rules(names)
    by_name = defaultdict(list)
    for rule in rules:
        if rule["road"]:
            by_name[rule["road"]].append(rule)
    known_names = {road["name"] for road in roads if road["name"]}
    whole_only = {name for name, entries in by_name.items() if
                  all(rule["scope"] == "whole" for rule in entries) and
                  len({rule["limit"] for rule in entries}) == 1}
    files = [TMP / "road-codes.xlsx", TMP / "RoadSectionLine_Sep2026.zip"] + [
        TMP / f"speed-schedule-{i}.html" for i in LIMITS]
    report = {
        "roadParts": len(roads), "vertices": sum(len(road["points"]) for road in roads),
        "namedRoadParts": sum(road["name"] is not None for road in roads),
        "roadNames": len(known_names), "legalEntries": len(rules),
        "scopeCounts": dict(Counter(rule["scope"] for rule in rules)),
        "wholeRoadRulesWithoutOtherExceptions": len(whole_only & known_names),
        "partialOrEstateRoadNames": len({name for name in by_name if name not in whole_only}),
        "hillviewRules": by_name["HILLVIEW AVENUE"],
        "sourcesSha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in files},
        "status": "Inspection only. No partial/estate limits have been assigned to geometry.",
    }
    (TMP / "speedlimit-road-inspection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (TMP / "speedlimit-road-draft.json").write_text(json.dumps(
        {"roads": roads, "rules": rules}, separators=(",", ":")), encoding="utf-8")
    if args.publish:
        publish(roads, rules, names, whole_only, report)
    print(json.dumps({key: value for key, value in report.items()
                      if key not in {"sourcesSha256", "hillviewRules"}}, indent=2))


def publish(roads, rules, names, whole_only, report):
    curated = json.loads((ROOT / "sites/speedlimit/data/verified-road-sections.json").read_text())
    if curated["roadGeometrySha256"] != report["sourcesSha256"]["RoadSectionLine_Sep2026.zip"]:
        raise ValueError("Road geometry changed; review curated feature IDs before publishing")
    by_id = {road["id"]: road for road in roads}
    for correction in curated["nameCorrections"]:
        road = by_id[correction["featureId"]]
        assert road["roadCode"] == correction["sourceRoadCode"]
        road.update(roadCode=correction["roadCode"], name=correction["name"])
    whole_limits = {rule["road"]: rule["limit"] for rule in rules if rule["road"] in whole_only}
    overrides, resolved = resolve_junction_ranges(roads, rules)
    for section in curated["sections"]:
        source = next(rule for rule in rules if rule["id"] == section["legalEntry"])
        assert source["road"] == section["name"] and source["limit"] == section["limit"]
        for identity in section["featureIds"]:
            assert by_id[identity]["roadCode"] == section["roadCode"]
            overrides[identity] = section["limit"]
    identities = sorted({road["roadCode"] for road in roads})
    index = {code: i for i, code in enumerate(identities)}
    labels = [[code, names.get(code)] for code in identities]
    features = [[index[road["roadCode"]], overrides.get(road["id"], whole_limits.get(road["name"])),
                 road["id"], road["points"]] for road in roads]
    metadata = {**report, "verifiedRoadParts": sum(row[1] is not None for row in features),
                "mappedRoadNames": len({labels[row[0]][1] for row in features if row[1] is not None}),
                "geometryDate": "2026-09", "legalEffectiveDate": "2026-01-01",
                "status": "Unresolved stretches use labelled sign/default fallback.",
                "geometrySource": "https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/RoadSectionLine_Sep2026.zip",
                "legalSource": "https://sso.agc.gov.sg/SL/RTA1961-N6"}
    metadata["resolvedJunctionRanges"] = len(resolved)
    compact = lambda value: json.dumps(value, separators=(",", ":"))
    target = ROOT / "sites/speedlimit/static/network.mjs"
    target.write_text("// Generated by scripts/speedlimit_roads.py --publish. See DATA.md.\n"
                      + "export const NETWORK_INFO = Object.freeze(" + compact(metadata) + ");\n"
                      + "// Road identities: [official code, name]. Features: [road index, verified km/h or null, source feature ID, lon/lat vertices].\n"
                      + "export const ROAD_IDENTITIES = " + compact(labels) + ";\n"
                      + "export const ROAD_FEATURES = " + compact(features) + ";\n", encoding="utf-8")
    (ROOT / "sites/speedlimit/data/road-coverage.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (ROOT / "sites/speedlimit/data/resolved-road-sections.json").write_text(json.dumps(resolved, indent=2), encoding="utf-8")
    print(f"Published {len(features)} road parts; {metadata['verifiedRoadParts']} with mapped legal limits.")


def resolve_junction_ranges(roads, rules):
    """Resolve only named-junction ranges with exact vertices and a unique path.

    No proximity snapping, guessed lamp posts, estate extents, directional
    assumptions or shortest-path selection among alternatives are permitted.
    A feature that straddles a boundary stays unresolved rather than receiving
    the limit across its full length.
    """
    by_name = defaultdict(list)
    vertices = defaultdict(set)
    for road in roads:
        if road["name"]:
            by_name[road["name"]].append(road)
            vertices[road["name"]].update(map(tuple, road["points"]))
    proposals = defaultdict(set)
    resolved = []
    for rule in rules:
        if rule["scope"] != "partial" or not rule["road"]:
            continue
        text = normalize(rule["description"])
        match = re.search(r" BETWEEN (.+?) AND (.+?)\.$", text)
        if not match or any(word in text for word in ["DIRECTION", "LAMP POST", "SLIP ROAD", "TUNNEL"]):
            continue
        a_name, b_name = match.groups()
        primary = rule["road"]
        a = vertices[primary] & vertices[a_name]
        b = vertices[primary] & vertices[b_name]
        if len(a) != 1 or len(b) != 1:
            continue
        start, end = next(iter(a)), next(iter(b))
        graph = defaultdict(set)
        for road in by_name[primary]:
            for x, y in zip(map(tuple, road["points"]), map(tuple, road["points"][1:])):
                if x != y:
                    graph[x].add(y); graph[y].add(x)
        visited = {start: None}
        pending = deque([start])
        while pending:
            node = pending.popleft()
            for nxt in graph[node]:
                if nxt not in visited:
                    visited[nxt] = node; pending.append(nxt)
        if end not in visited or sum(len(graph[node]) for node in visited) != 2 * (len(visited)-1):
            continue  # No unique tree path: leave the range unresolved.
        path_edges = set()
        node = end
        while visited[node] is not None:
            prev = visited[node]
            path_edges.add(frozenset((node, prev))); node = prev
        ids = []
        for road in by_name[primary]:
            points = list(map(tuple, road["points"]))
            edges = {frozenset((x,y)) for x,y in zip(points, points[1:]) if x != y}
            if edges and edges <= path_edges:
                proposals[road["id"]].add(rule["limit"]); ids.append(road["id"])
        if ids:
            resolved.append({"legalEntry": rule["id"], "road": primary,
                             "limit": rule["limit"], "boundaryNames": [a_name,b_name],
                             "boundaryJunctions": [list(start),list(end)], "featureIds": ids,
                             "source": rule["source"]})
    return {identity: next(iter(values)) for identity, values in proposals.items() if len(values)==1}, resolved


if __name__ == "__main__":
    main()
