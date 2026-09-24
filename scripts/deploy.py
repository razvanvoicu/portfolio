"""Push the local image to Artifact Registry and deploy it to Cloud Run."""

from __future__ import annotations

import shutil
import subprocess
import tomllib

from docker import IMAGE, ROOT, build, docker

REGISTRY_IMAGE = "asia-southeast1-docker.pkg.dev/personalexperiments01/docker/portfolio"
REGION = "asia-southeast1"
SERVICE = "portfolio"
SERVICE_ACCOUNT = "portfolio-runner@personalexperiments01.iam.gserviceaccount.com"


def gcloud_executable() -> str:
    executable = shutil.which("gcloud")
    if executable:
        return executable
    raise SystemExit("The gcloud CLI was not found. Install the Google Cloud SDK and ensure gcloud is on PATH.")


def gcloud(*arguments: str) -> None:
    subprocess.run([gcloud_executable(), *arguments], cwd=ROOT, check=True)


def git(*arguments: str) -> str:
    result = subprocess.run(["git", *arguments], cwd=ROOT, check=True, capture_output=True, text=True)
    return result.stdout.strip()


def project_version() -> str:
    data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    return data["project"]["version"]


def is_release_commit(version: str) -> bool:
    try:
        described = git("describe", "--tags", "--exact-match")
    except subprocess.CalledProcessError:
        return False
    return described == f"v{version}"


def deploy() -> None:
    if git("status", "--porcelain"):
        raise SystemExit("Working tree has uncommitted changes. Commit or stash before deploying.")

    build()

    version = project_version()
    short_sha = git("rev-parse", "--short", "HEAD")

    tags = [f"{REGISTRY_IMAGE}:v{version}-{short_sha}"]
    if is_release_commit(version):
        tags.append(f"{REGISTRY_IMAGE}:v{version}")

    for tag in tags:
        docker("tag", IMAGE, tag)
        docker("push", tag)

    primary_tag = tags[0]
    gcloud(
        "run", "deploy", SERVICE,
        "--image", primary_tag,
        "--region", REGION,
        "--service-account", SERVICE_ACCOUNT,
        "--allow-unauthenticated",
        "--quiet",
    )

    print(f"Deployed {primary_tag} to Cloud Run service '{SERVICE}' in {REGION}.")
    print("Pushed tags: " + ", ".join(tag.rsplit(":", 1)[1] for tag in tags))


def main() -> int:
    deploy()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
