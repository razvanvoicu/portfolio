"""Render all site content and stage deployable assets under tmp/www."""

from __future__ import annotations

import shutil

from insert import MARKER_PATTERN, ROOT, SITES, insert_source


STAGE = ROOT / "tmp" / "www"


def prepare_public() -> None:
    for site in sorted(path for path in SITES.iterdir() if path.is_dir()):
        templates = site / "templates"
        static = site / "static"
        public = site / "public"
        if not templates.is_dir() or not static.is_dir():
            raise SystemExit(f"{site.relative_to(ROOT)} must contain templates/ and static/")
        if public.exists():
            shutil.rmtree(public)
        shutil.copytree(templates, public)
        shutil.copytree(static, public, dirs_exist_ok=True)


def marker_sources() -> set[str]:
    sources: set[str] = set()
    for html_path in SITES.glob("*/public/**/*.html"):
        for line in html_path.read_text(encoding="utf-8").splitlines():
            match = MARKER_PATTERN.match(line)
            if match:
                sources.add(match.group("source"))
    return sources


def stage_sites() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)

    for site in sorted(path for path in SITES.iterdir() if path.is_dir()):
        destination = STAGE / site.name
        shutil.copytree(site / "public", destination)


def main() -> int:
    prepare_public()
    sources = marker_sources()
    if not sources:
        raise SystemExit("No RST insertion markers were found.")
    for source in sorted(sources):
        insert_source(source)
    stage_sites()
    print(f"Staged {len(list(STAGE.iterdir()))} site(s) in {STAGE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
