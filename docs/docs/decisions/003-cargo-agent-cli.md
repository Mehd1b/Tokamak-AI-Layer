---
title: "ADR-003: cargo-agent CLI"
sidebar_position: 3
---

# ADR-003: cargo-agent CLI

**Status**: Accepted
**Date**: 2025

## Context

Agent development required multiple scattered commands:

```bash
# Scaffold
agent-pack scaffold my-agent --template yield

# Build
cargo build -p my-agent --release

# Test
cargo test -p my-agent

# Verify manifest
agent-pack verify --manifest crates/agents/my-agent/dist/agent-pack.json
```

Developers needed to remember:
- Which tool to invoke for each step (`agent-pack` vs `cargo`)
- The correct `-p` package name
- Manifest file paths
- Workspace root location

## Decision

Create `cargo-agent`, a Cargo subcommand that wraps all agent lifecycle operations under a single `cargo agent` prefix:

```bash
cargo agent new my-agent              # Scaffold
cargo agent build my-agent            # Build
cargo agent test my-agent             # Test
cargo agent pack my-agent             # Verify manifest
cargo agent list                      # List agents
```

The CLI:
- Auto-discovers the workspace root
- Resolves agent directories from `crates/agents/<name>`
- Delegates to `cargo build/test` with the correct `-p` flag
- Wraps `agent-pack` scaffold for project creation
- Passes through extra arguments (e.g., `-- --nocapture`)

## Consequences

### Positive

- **Single entry point** for all agent operations
- Discoverable workflow — `cargo agent --help` shows everything
- Consistent with Cargo ecosystem conventions (`cargo fmt`, `cargo clippy`, etc.)
- No need to remember paths or package names
- `cargo agent list` provides quick workspace overview

### Negative

- Requires installation (`cargo install --path crates/tools/cargo-agent`)
- Thin wrapper — raw `cargo build -p` still works for advanced users
- Must be kept in sync with scaffold changes in `agent-pack`

### Alternative Considered

A Makefile or justfile was considered but rejected because:
- Not discoverable via `--help`
- Requires separate installation (`just`)
- Doesn't integrate with the Cargo ecosystem
