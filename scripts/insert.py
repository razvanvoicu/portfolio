"""Render one RST file into every matching marker in site HTML files."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from docutils.core import publish_parts


ROOT = Path(__file__).resolve().parents[1]
SITES = ROOT / "sites"
MARKER_PATTERN = re.compile(r"^(?P<indent>[ \t]*)<!-- \|\|(?P<source>[^|]+\.rst)\|\| -->\s*$")


class InsertionError(RuntimeError):
    """Raised when a requested insertion cannot be completed safely."""


def render_rst(source_path: Path) -> str:
    source = source_path.read_text(encoding="utf-8")
    parts = publish_parts(
        source=source,
        source_path=str(source_path),
        writer_name="html5",
        settings_overrides={
            "doctitle_xform": False,
            "initial_header_level": 2,
            "report_level": 2,
            "halt_level": 2,
            "warning_stream": sys.stderr,
        },
    )
    return parts["fragment"].strip()


def _indent_width(line: str) -> int:
    prefix = line[: len(line) - len(line.lstrip(" \t"))]
    return len(prefix.expandtabs(4))


def insert_fragment(html: str, source_name: str, fragment: str) -> tuple[str, int]:
    lines = html.splitlines()
    output: list[str] = []
    count = 0
    index = 0

    while index < len(lines):
        line = lines[index]
        match = MARKER_PATTERN.match(line)
        output.append(line)
        index += 1

        if not match or match.group("source") != source_name:
            continue

        count += 1
        marker_width = _indent_width(line)

        # The generated region consists of all following lines indented more
        # deeply than the marker. Blank lines inside that region are discarded.
        while index < len(lines):
            candidate = lines[index]
            if candidate.strip() and _indent_width(candidate) <= marker_width:
                break
            index += 1

        child_indent = match.group("indent") + "  "
        for fragment_line in fragment.splitlines():
            output.append(child_indent + fragment_line if fragment_line else "")

    trailing_newline = "\n" if html.endswith(("\n", "\r")) else ""
    return "\n".join(output) + trailing_newline, count


def _site_root(html_path: Path, sites_root: Path) -> Path:
    relative = html_path.relative_to(sites_root)
    if len(relative.parts) < 2:
        raise InsertionError(f"HTML file is not inside a site directory: {html_path}")
    return sites_root / relative.parts[0]


def insert_source(source_name: str, sites_root: Path = SITES) -> int:
    if Path(source_name).name != source_name or not source_name.endswith(".rst"):
        raise InsertionError("source must be a simple .rst filename, such as test.rst")

    matches = 0
    for html_path in sorted(sites_root.glob("*/public/**/*.html")):
        original = html_path.read_text(encoding="utf-8")
        if f"<!-- ||{source_name}|| -->" not in original:
            continue

        source_path = _site_root(html_path, sites_root) / "content" / source_name
        if not source_path.is_file():
            raise InsertionError(f"marker in {html_path} has no source at {source_path}")

        updated, count = insert_fragment(original, source_name, render_rst(source_path))
        if count:
            html_path.write_text(updated, encoding="utf-8", newline="\n")
            matches += count
            print(f"Inserted {source_name} at {count} marker(s) in {html_path.relative_to(ROOT)}")

    if not matches:
        raise InsertionError(f"no HTML insertion markers found for {source_name}")
    return matches


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="simple RST filename, for example test.rst")
    args = parser.parse_args()
    try:
        insert_source(args.source)
    except InsertionError as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
