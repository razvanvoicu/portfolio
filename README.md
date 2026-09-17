# portfolio

This repository builds one Docker image that serves multiple static sites with
nginx. Nginx selects a site from the HTTP `Host` header, so several domain names
can point to the same service and IP address.

The portfolio is available as `portfolio.raz.sg` in deployment and as
`http://portfolio.raz:8000` during local testing. The notes site is available as
`notes.raz.sg` in deployment and as `http://notes.raz:8000` locally. Configuring
the local hostnames is intentionally outside this repository.

## Prerequisites

- Docker Desktop, with the `docker` command available
- [`uv`](https://docs.astral.sh/uv/)
- Poe the Poet, installed once with `uv tool install poethepoet`

Run `uv sync` after cloning to create the locked Python environment. Run `poe`
without arguments to see all project tasks.

## Common tasks

```text
poe insert test.rst  Render test.rst at every matching marker
poe build            Render all insertions and stage the Docker context
poe pull             Pull the pinned official nginx base image
poe image            Build portfolio:local in Docker Desktop
poe run              Build and run it on localhost port 8000
poe stop             Remove the local container
poe test             Run automated tests
```

The direct standalone insertion command is also supported:

```text
uv run python scripts/insert.py test.rst
```

## Repository layout

```text
nginx/                   Complete nginx configuration copied into the image
  nginx.conf
  mime.types
  sites/                 Host-specific server blocks
scripts/                 All build and Docker automation
sites/
  portfolio/             Files belonging to the portfolio site
    content/             RST sources; never copied into the image
    templates/           Source HTML containing insertion markers
    static/              Source CSS, images, JavaScript, fonts, and binaries
    public/              Generated deployable files, tracked in Git
  notes/                 Notes site with the same content/templates/static/public layout
tests/                   Automation tests (Selenium tests can be added here)
tmp/                     Disposable build staging; ignored by Git
```

The build recreates `public/` from `templates/` and `static/`, performs all RST
insertions there, and copies it to `tmp/www/<site-name>/`. Only that temporary
copy is placed in the image. Generated deployable files such as
`sites/portfolio/public/index.html` remain tracked in Git; `tmp/` is only
transient staging.

## RST insertion convention

An HTML marker names an RST file found in the same site's `content/` directory:

```html
<div>
  <!-- ||test.rst|| -->
</div>
```

`poe insert test.rst` scans every HTML file below each site's `public/`
directory. For each matching marker, it renders that site's `content/test.rst`
as an HTML fragment and inserts it immediately below the marker. The marker is
retained. This standalone task does not recopy the templates or static assets.

On the next insertion or build, every line following the marker whose indentation
is deeper than the marker is treated as the prior generated region and replaced.
The first nonblank line at the marker's indentation level or above ends that
region. Manual edits must preserve this convention.

If two sites both use a marker for `test.rst`, each receives content from its own
`content/test.rst`. The filename argument is intentionally simple and cannot
contain a path.

## Adding a site

1. Create `sites/<site-name>/content`, `templates`, `static`, and `public`.
2. Put any RST sources in `sites/<site-name>/content/`.
3. Add insertion markers to HTML files under `templates/`; `poe build` creates
   their generated counterparts under `public/`.
4. Add `nginx/sites/<site-name>.conf` with its hostnames and a document root of
   `/srv/www/<site-name>`.
5. Run `poe build`, then `poe test`.

Asset authoring, binary copying, and build processes belonging to other projects
are outside this repository. Those processes may place finished files in the
appropriate `templates/`, `static/`, or `content/` directory.

## Nginx and Docker

The Dockerfile starts from a pinned official nginx image, removes `/etc/nginx`,
and replaces it with this repository's `nginx/` directory. No packaged default
nginx configuration is used. Unmapped hostnames, including the Cloud Run service
URL, serve the portfolio site.

`poe run` publishes host port 8000 to container port 8080. Once the container is
running, browse to `http://portfolio.raz:8000` or `http://notes.raz:8000`.

## Cloud Run

Images are stored in Artifact Registry at
`asia-southeast1-docker.pkg.dev/personalexperiments01/docker/portfolio`. The
public `portfolio` Cloud Run service in
`asia-southeast1` runs the image at
`https://portfolio-865903743674.asia-southeast1.run.app/`. It listens on port
8080, uses the `portfolio-runner` service account with no project roles, and
scales from zero to two instances (1 CPU, 256 MiB memory).

The Cloud Run URL serves the portfolio. The `notes.raz.sg` custom domain maps to
the same service, with a CNAME pointing to `ghs.googlehosted.com`.
