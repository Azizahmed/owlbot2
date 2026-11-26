# syntax=docker/dockerfile:1
#
# OwlBot on a server of your own, in a container: the release's
# owlbot-server, checked against the sha256 the release publishes, running
# as an account of its own with everything it keeps in one volume.
# compose.yml beside this file runs it, and docs/DOCKER.md walks through
# it from nothing. The release workflow publishes this same image to
# ghcr.io/Azizahmed/owlbot2-server (.github/workflows/container.yml).
#
#   docker build -t owlbot-server .                       # the latest release
#   docker build --build-arg OWLBOT_VERSION=3.2.1 -t owlbot-server .

ARG NODE_VERSION=22

# ── the release, fetched and checked ─────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS release
ARG OWLBOT_VERSION=latest
ARG OWLBOT_REPO=Azizahmed/owlbot2
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp/release
# "latest" is asked of GitHub, the way `owlbot-server update` asks; a
# version is taken as given. Either way the tarball is unpacked only if it
# matches the checksum published beside it.
RUN set -eu; \
    version="${OWLBOT_VERSION#v}"; \
    if [ "$version" = "latest" ] || [ -z "$version" ]; then \
      version="$(curl -fsSL "https://api.github.com/repos/${OWLBOT_REPO}/releases/latest" \
        | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const t=JSON.parse(s).tag_name||"";process.stdout.write(t.replace(/^v/,""))})')"; \
    fi; \
    echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "No release version to build ($version)."; exit 1; }; \
    name="owlbot-server-${version}.tar.gz"; \
    base="https://github.com/${OWLBOT_REPO}/releases/download/v${version}"; \
    curl -fsSLO "${base}/${name}"; \
    curl -fsSLO "${base}/${name}.sha256"; \
    sha256sum -c "${name}.sha256"; \
    mkdir -p /opt/owlbot-server; \
    tar -xzf "${name}" --strip-components=1 -C /opt/owlbot-server; \
    rm -f /opt/owlbot-server/Dockerfile /opt/owlbot-server/owlbot-server.service

# ── the server ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim

# What agents reach for on a server: a shell, git and ssh for remotes,
# curl, ripgrep, python, and tini to pass signals on and reap what their
# commands leave behind. `script` (the terminal's pty) is already here.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git less openssh-client procps python3 ripgrep tini \
 && rm -rf /var/lib/apt/lists/*

# The node image's own account, uid and gid 1000, renamed: the first
# account on most machines, so a folder bind-mounted from the host is
# usually already its. Never root, and no sudo.
RUN usermod -l owlbot -d /home/owlbot -m node && groupmod -n owlbot node

# The release stays root's, so nothing OwlBot or an agent runs can change
# the code it runs; an update is a newer image (docs/DOCKER.md).
COPY --from=release /opt/owlbot-server /opt/owlbot-server
RUN printf '#!/bin/sh\nexec node /opt/owlbot-server/bin/owlbot-server.mjs "$@"\n' > /usr/local/bin/owlbot-server \
 && chmod 0755 /usr/local/bin/owlbot-server

# Everything OwlBot keeps is under /home/owlbot, one volume: the workspace
# (.owlbot), the engines installed from the app or the terminal (.local),
# and their sign-ins (.claude, .codex and the rest), so recreating the
# container loses none of it.
#
# OWLBOT_LISTEN: listen beyond the container's own loopback, so the port
# compose.yml publishes reaches it. Who reaches that port is the publish
# line's to say, and nothing past /api/health answers without a paired
# device's token (docs/SELF_HOSTING.md).
ENV HOME=/home/owlbot \
    OWLBOT_DATA_DIR=/home/owlbot/.owlbot \
    OWLBOT_LISTEN=0.0.0.0 \
    OWLBOT_PORT=8799 \
    OWLBOT_CONTAINER=image \
    NPM_CONFIG_PREFIX=/home/owlbot/.local \
    PATH=/home/owlbot/.local/bin:$PATH

USER owlbot
WORKDIR /home/owlbot
VOLUME ["/home/owlbot"]
EXPOSE 8799

# /api/health answers anyone, a container's own loopback included, and
# only once the server is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.OWLBOT_PORT||8799)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["owlbot-server"]
