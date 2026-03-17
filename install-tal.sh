#!/bin/sh
# install-tal.sh — Install the `tal` CLI for the Tokamak AI Layer.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/tokamak-network/Tokamak-AI-Layer/master/install-tal.sh | sh
#
# Environment variables:
#   TAL_VERSION   — specific version to install (default: latest)
#   TAL_INSTALL   — installation directory (default: $HOME/.tal/bin)

set -eu

REPO="tokamak-network/Tokamak-AI-Layer"
BINARY_NAME="tal"
DEFAULT_INSTALL_DIR="$HOME/.tal/bin"

main() {
    need_cmd curl
    need_cmd tar
    need_cmd uname

    INSTALL_DIR="${TAL_INSTALL:-$DEFAULT_INSTALL_DIR}"

    # Detect platform
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux)  OS_TAG="unknown-linux-gnu" ;;
        Darwin) OS_TAG="apple-darwin" ;;
        MINGW*|MSYS*|CYGWIN*)
            err "Windows detected. Please download the binary manually from GitHub Releases."
            ;;
        *) err "Unsupported operating system: $OS" ;;
    esac

    case "$ARCH" in
        x86_64|amd64)   ARCH_TAG="x86_64" ;;
        aarch64|arm64)  ARCH_TAG="aarch64" ;;
        *) err "Unsupported architecture: $ARCH" ;;
    esac

    TARGET="${ARCH_TAG}-${OS_TAG}"

    # Resolve version
    if [ -n "${TAL_VERSION:-}" ]; then
        TAG="tal-v${TAL_VERSION}"
    else
        say "Fetching latest release..."
        TAG=$(curl -sSf "https://api.github.com/repos/${REPO}/releases" \
            | grep '"tag_name"' \
            | grep 'tal-v' \
            | head -1 \
            | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

        if [ -z "$TAG" ]; then
            err "Could not determine latest version. Set TAL_VERSION manually."
        fi
    fi

    VERSION="${TAG#tal-v}"
    ARCHIVE_NAME="${BINARY_NAME}-${TAG}-${TARGET}"
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ARCHIVE_NAME}.tar.gz"
    CHECKSUM_URL="${DOWNLOAD_URL}.sha256"

    say "Installing tal v${VERSION} for ${TARGET}..."

    # Create temp directory
    TMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TMP_DIR"' EXIT

    # Download archive
    say "Downloading ${DOWNLOAD_URL}..."
    curl -sSfL "$DOWNLOAD_URL" -o "$TMP_DIR/archive.tar.gz" || err "Download failed. Check that a release exists for ${TARGET}."

    # Verify checksum if available
    if curl -sSfL "$CHECKSUM_URL" -o "$TMP_DIR/checksum.sha256" 2>/dev/null; then
        say "Verifying checksum..."
        EXPECTED=$(cut -d' ' -f1 "$TMP_DIR/checksum.sha256")
        if command -v sha256sum >/dev/null 2>&1; then
            ACTUAL=$(sha256sum "$TMP_DIR/archive.tar.gz" | cut -d' ' -f1)
        elif command -v shasum >/dev/null 2>&1; then
            ACTUAL=$(shasum -a 256 "$TMP_DIR/archive.tar.gz" | cut -d' ' -f1)
        else
            say "Warning: cannot verify checksum (no sha256sum or shasum found)"
            ACTUAL="$EXPECTED"
        fi

        if [ "$EXPECTED" != "$ACTUAL" ]; then
            err "Checksum mismatch!\n  Expected: ${EXPECTED}\n  Got:      ${ACTUAL}"
        fi
    fi

    # Extract
    say "Extracting..."
    tar xzf "$TMP_DIR/archive.tar.gz" -C "$TMP_DIR"

    # Install
    mkdir -p "$INSTALL_DIR"
    cp "$TMP_DIR/${ARCHIVE_NAME}/${BINARY_NAME}" "$INSTALL_DIR/${BINARY_NAME}"
    chmod +x "$INSTALL_DIR/${BINARY_NAME}"

    say "Installed tal to ${INSTALL_DIR}/${BINARY_NAME}"

    # Check PATH
    case ":$PATH:" in
        *":${INSTALL_DIR}:"*) ;;
        *)
            say ""
            say "Add tal to your PATH by adding this to your shell profile:"
            say ""
            say "  export PATH=\"${INSTALL_DIR}:\$PATH\""
            say ""

            # Try to detect shell and suggest the right file
            SHELL_NAME="$(basename "${SHELL:-/bin/sh}")"
            case "$SHELL_NAME" in
                zsh)  say "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.zshrc" ;;
                bash) say "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.bashrc" ;;
                fish) say "  fish_add_path ${INSTALL_DIR}" ;;
                *)    say "  # Add to your shell's rc file" ;;
            esac
            say ""
            ;;
    esac

    say "Done! Run 'tal --help' to get started."
}

say() {
    printf "  %s\n" "$@"
}

err() {
    say "Error: $1" >&2
    exit 1
}

need_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        err "Required command not found: $1"
    fi
}

main "$@"
