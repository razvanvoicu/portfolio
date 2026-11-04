"""Manual sign corrections survive rebuilds and reject stale source records."""
import pytest

from scripts.speedlimit_data import apply_sign_corrections, school_zone_sign


def correction(operation, identity, **values):
    return dict(operation=operation, id=identity, reason="Verified sign", evidence="Photo", **values)


def test_add_update_disable_preserve_source_and_unrelated_signs():
    source = [[103.7, 1.3, 40, 270, 1], [103.8, 1.4, 60, 90, 2]]
    added = [103.76, 1.35, 40, 270, "manual:example"]
    updated = [103.71, 1.3, 40, 270, 1]
    assert apply_sign_corrections(source, [
        correction("add", added[4], sign=added),
        correction("update", 1, expected=source[0], sign=updated),
        correction("disable", 2, expected=source[1]),
    ]) == [updated, added]
    assert source == [[103.7, 1.3, 40, 270, 1], [103.8, 1.4, 60, 90, 2]]


@pytest.mark.parametrize("entry", [
    correction("add", 1, sign=[103, 1, 40, 270, 1]),
    correction("update", 1, expected=[103, 1, 50, 270, 1], sign=[103, 1, 40, 270, 1]),
    correction("disable", 2, expected=[103, 1, 40, 270, 2]),
    correction("add", "manual:bad", sign=[103, 1, 40, 360, "manual:bad"]),
])
def test_unsafe_corrections_fail(entry):
    with pytest.raises(ValueError):
        apply_sign_corrections([[103, 1, 40, 270, 1]], [entry])


@pytest.mark.parametrize("label,limit,kind", [
    ("School Zone Drive Carefully [3134]", None, "school-warning"),
    ("School Zone Drive Carefully Slow Down [3239]", None, "school-warning"),
    ("School Zone, Drive Carefully Slow Down & Time Plate [3063]", None, "school-warning"),
    ("Children Ahead logo - School Zone [2090]", None, "school-warning"),
    ("School Zone For 400m [4003]", None, "school-warning"),
    ("School Zone [3070]", None, "school-warning"),
    ("School Zone, 40 km/h [9999]", 40, "school-start"),
    ("End Of School Zone [3064]", None, "school-end"),
])
def test_school_warnings_do_not_establish_a_speed_limit(label, limit, kind):
    feature = {"geometry": {"coordinates": [103.7703385, 1.3009885]},
               "properties": {"TYP_CD": label, "BEARG_NUM": 201, "UNIQUE_ID": 30634}}
    assert school_zone_sign(feature) == [103.7703385, 1.3009885, limit, 201, 30634, kind]


def test_numeric_speed_sign_remains_separate_from_school_zone_classification():
    assert school_zone_sign({"properties": {"TYP_CD": "Maximum Speed Limit 40 [1015]"}}) is None
