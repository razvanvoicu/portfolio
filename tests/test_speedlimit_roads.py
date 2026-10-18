"""Boundary-resolution regressions; optional compiler tools live in tmp/."""
import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tmp/roadtools"))
pytest.importorskip("bs4")
pytest.importorskip("pyproj")
pytest.importorskip("shapefile")
from scripts.speedlimit_roads import resolve_junction_ranges


def road(identity, name, points):
    return {"id": identity, "name": name, "points": points}


def rule(scope="partial"):
    return {"id": "test", "road": "MAIN ROAD", "limit": 60, "scope": scope,
            "description": "Main Road — that part of Main Road between A Road and B Road.", "source": "test"}


def test_only_geometry_between_named_junctions_receives_limit():
    roads = [road(1,"MAIN ROAD",[[0,0],[1,0]]), road(2,"MAIN ROAD",[[1,0],[2,0]]),
             road(3,"MAIN ROAD",[[2,0],[3,0]]), road(4,"A ROAD",[[1,0],[1,1]]),
             road(5,"B ROAD",[[2,0],[2,1]])]
    limits, records = resolve_junction_ranges(roads,[rule()])
    assert limits == {2:60}
    assert records[0]["featureIds"] == [2]
    assert resolve_junction_ranges(roads,[rule("estate")])[0] == {}


def test_ambiguous_paths_and_missing_exact_junctions_stay_unresolved():
    roads = [road(1,"MAIN ROAD",[[0,0],[1,0],[2,0]]),
             road(2,"MAIN ROAD",[[0,0],[1,1],[2,0]]),
             road(3,"A ROAD",[[0,0],[0,-1]]),road(4,"B ROAD",[[2,0],[2,-1]])]
    assert resolve_junction_ranges(roads,[rule()])[0] == {}
    roads[0]["points"]=[[0.001,0],[1,0],[2,0]]
    roads.pop(1)
    assert resolve_junction_ranges(roads,[rule()])[0] == {}


def test_feature_straddling_legal_boundary_is_not_assigned_whole_limit():
    roads = [road(1,"MAIN ROAD",[[0,0],[1,0],[2,0],[3,0]]),
             road(2,"A ROAD",[[1,0],[1,1]]),road(3,"B ROAD",[[2,0],[2,1]])]
    assert resolve_junction_ranges(roads,[rule()])[0] == {}
