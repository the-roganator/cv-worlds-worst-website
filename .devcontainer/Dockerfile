# The dev container: the same toolchain as a laptop, installed by mise at the versions mise.lock holds.
FROM mcr.microsoft.com/devcontainers/base:3.0.14-resolute@sha256:e15941f70f26542ef9b0ef4bb64f88b8ecdfe8c3372e730ab6e405792805e742

# mise from its signed apt repository.
RUN install -d -m 0755 /etc/apt/keyrings \
 && curl -fsSL https://mise.jdx.dev/gpg-key.pub | gpg --dearmor -o /etc/apt/keyrings/mise-archive-keyring.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/mise-archive-keyring.gpg] https://mise.jdx.dev/deb stable main" > /etc/apt/sources.list.d/mise.list \
 && apt-get update \
 && apt-get install --yes --no-install-recommends mise \
 && rm -rf /var/lib/apt/lists/*

USER vscode
ENV PATH=/home/vscode/.local/share/mise/shims:$PATH
