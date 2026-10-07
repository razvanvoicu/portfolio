"""Run the JavaScript tests of the formula importer under pytest."""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_jsformula_importer() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is not installed")
    test_files = sorted(str(path.relative_to(ROOT)) for path in (ROOT / "tests" / "js").glob("*.test.js"))
    assert test_files, "no JavaScript test files found"
    result = subprocess.run(
        [node, "--test", *test_files],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
