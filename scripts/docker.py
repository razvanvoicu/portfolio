"""Manage the local Docker image and container."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE_IMAGE = "nginx:1.31.5-alpine3.24"
IMAGE = "portfolio:local"
CONTAINER = "portfolio"


def docker_executable() -> str:
    executable = shutil.which("docker")
    if executable:
        return executable

    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        bundled = Path(local_app_data) / "Programs" / "DockerDesktop" / "resources" / "bin" / "docker.exe"
        if bundled.is_file():
            return str(bundled)

    raise SystemExit("Docker CLI was not found. Install or start Docker Desktop and ensure docker is on PATH.")


def docker(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run([docker_executable(), *arguments], cwd=ROOT, check=check, text=True)


def pull() -> None:
    docker("pull", BASE_IMAGE)


def build() -> None:
    subprocess.run([sys.executable, "scripts/build.py"], cwd=ROOT, check=True)
    docker("build", "--pull", "--tag", IMAGE, ".")


def stop() -> None:
    docker("rm", "--force", CONTAINER, check=False)


def run() -> None:
    build()
    stop()
    docker("run", "--detach", "--name", CONTAINER, "--publish", "8000:8080", IMAGE)
    print("Serving portfolio.raz at http://portfolio.raz:8000 and blog.raz at http://blog.raz:8000")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("pull", "build", "run", "stop"))
    args = parser.parse_args()
    globals()[args.action]()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
