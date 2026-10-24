"""Compile official data.gov.sg snapshots into offline JavaScript constants.

Usage: python scripts/speedlimit_data.py [--download]
Raw downloads stay in ignored tmp/. No API is called by the running app.
"""
import argparse
import hashlib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
DATASETS = {
    "traffic-signs": "d_bbf0132c7290d6838f82003972d933d5",
    "singapore-boundaries": "d_4765db0e87b9c86336792efe8a1f7a66",
}


def apply_sign_corrections(signs, corrections):
    """Apply explicit additions/updates/disables; fail on stale or ambiguous IDs."""
    records = {sign[4]: list(sign) for sign in signs}
    if len(records) != len(signs):
        raise ValueError("Duplicate source sign IDs")
    seen = set()
    for correction in corrections:
        identity = correction["id"]
        if identity in seen:
            raise ValueError(f"Duplicate correction: {identity}")
        seen.add(identity)
        if not correction.get("reason") or not correction.get("evidence"):
            raise ValueError(f"Correction needs reason and evidence: {identity}")
        operation = correction["operation"]
        if operation == "add":
            if not isinstance(identity, str) or not identity.startswith("manual:") or identity in records:
                raise ValueError(f"Addition needs an unused manual: ID: {identity}")
        elif operation in ("update", "disable"):
            if identity not in records or correction.get("expected") != records[identity]:
                raise ValueError(f"Source record changed or missing; review correction: {identity}")
        else:
            raise ValueError(f"Unknown correction operation: {operation}")
        if operation == "disable":
            del records[identity]
            continue
        sign = correction["sign"]
        if not isinstance(sign, list) or len(sign) != 5 or sign[4] != identity:
            raise ValueError(f"Invalid corrected sign: {identity}")
        if not all(type(value) in (int, float) and math.isfinite(value) for value in sign[:4]):
            raise ValueError(f"Invalid corrected sign values: {identity}")
        if not (-180 <= sign[0] <= 180 and -90 <= sign[1] <= 90 and sign[2] > 0 and 0 <= sign[3] < 360):
            raise ValueError(f"Corrected sign values out of range: {identity}")
        records[identity] = list(sign)
    return list(records.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    sources = {}
    documents = {}
    for name, dataset in DATASETS.items():
        path = ROOT / "tmp" / f"{name}.geojson"
        if args.download:
            path.parent.mkdir(exist_ok=True)
            with urlopen(f"https://api-open.data.gov.sg/v1/public/api/datasets/{dataset}/poll-download") as response:
                download = json.load(response)
            if download["code"] != 0:
                raise RuntimeError(download)
            with urlopen(download["data"]["url"]) as response:
                path.write_bytes(response.read())
        raw = path.read_bytes()
        documents[name] = json.loads(raw)
        sources[name] = {"dataset": dataset, "url": f"https://data.gov.sg/datasets/{dataset}/view",
                         "sha256": hashlib.sha256(raw).hexdigest()}
    signs = []
    school_signs = []
    for feature in documents["traffic-signs"]["features"]:
        props = feature["properties"]
        match = re.fullmatch(r"Maximum Speed Limit (\d+) \[\d+\]", props.get("TYP_CD") or "")
        if match:
            lon, lat = feature["geometry"]["coordinates"][:2]
            signs.append([round(lon, 7), round(lat, 7), int(match[1]), props.get("BEARG_NUM"), props["UNIQUE_ID"]])
        label = props.get("TYP_CD") or ""
        if "school zone" in label.lower():
            kind = "school-end" if label == "End Of School Zone [3064]" else "school-start"
            lon, lat = feature["geometry"]["coordinates"][:2]
            school_signs.append([round(lon, 7), round(lat, 7), None, props.get("BEARG_NUM"), props["UNIQUE_ID"], kind])
    corrections_path = ROOT / "sites/speedlimit/data/sign-corrections.json"
    corrections_raw = corrections_path.read_bytes()
    corrections = json.loads(corrections_raw)["corrections"]
    signs = apply_sign_corrections(signs, corrections)
    polygons = []
    for feature in documents["singapore-boundaries"]["features"]:
        geometry = feature["geometry"]
        parts = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        polygons.extend([[[round(x, 7), round(y, 7)] for x, y, *_ in ring] for ring in polygon] for polygon in parts)
    assert len(signs) > 4000 and len(polygons) >= 55
    metadata = {"retrieved": datetime.fromtimestamp((ROOT / "tmp" / "traffic-signs.geojson").stat().st_mtime, timezone.utc).isoformat(), "sources": sources,
                "signCount": len(signs), "schoolSignCount": len(school_signs), "coverage": "Sign points only; not road-segment speed limits.",
                "license": "Singapore Open Data Licence",
                "manualCorrections": {"file": "data/sign-corrections.json", "sha256": hashlib.sha256(corrections_raw).hexdigest(), "count": len(corrections)}}
    target = ROOT / "sites" / "speedlimit" / "static"
    target.mkdir(parents=True, exist_ok=True)
    compact = lambda value: json.dumps(value, separators=(",", ":"))
    (target / "road-data.js").write_text(
        "// Generated by scripts/speedlimit_data.py. See DATA.md for limitations and attribution.\n"
        + "export const DATA_INFO = Object.freeze(" + compact(metadata) + ");\n"
        + "// Each sign: [longitude, latitude, km/h, sign bearing, source unique ID].\n"
        + "export const SPEED_SIGNS = Object.freeze(" + compact(signs) + ".map(Object.freeze));\n"
        + "// School signs use the same fields, followed by school-start or school-end.\n"
        + "export const SCHOOL_SIGNS = Object.freeze(" + compact(school_signs) + ".map(Object.freeze));\n"
        + "export const SG_POLYGONS = Object.freeze(" + compact(polygons) + ");\n", encoding="utf-8")
    print(f"Compiled {len(signs)} speed-limit signs, {len(school_signs)} school-zone signs and {len(polygons)} boundary polygons.")


if __name__ == "__main__":
    main()
