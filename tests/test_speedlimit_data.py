"""Manual sign corrections survive rebuilds and reject stale source records."""
import pytest

from scripts.speedlimit_data import apply_sign_corrections


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
