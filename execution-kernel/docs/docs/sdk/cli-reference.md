---
title: cargo-agent CLI Reference
sidebar_position: 7
---

# `cargo agent` CLI Reference

The `cargo-agent` CLI provides a unified workflow for agent development: scaffolding, building, testing, and packaging.

## Installation

```bash
cargo install --path crates/tools/cargo-agent
```

After installation, all commands are available as `cargo agent <subcommand>`.

## `cargo agent new`

Create a new agent project.

```
cargo agent new <NAME> [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--template <TYPE>` | `minimal` | Template: `minimal` or `yield` |
| `--out <PATH>` | `crates/agents/<NAME>` | Output directory |
| `--agent-id <HEX>` | `0x00...00` | Pre-set agent ID (64-char hex with `0x` prefix) |
| `--no-git` | false | Skip `git init` |

### Examples

```bash
# Minimal agent (no-op template)
cargo agent new my-agent

# Yield farming template with custom ID
cargo agent new my-yield-agent --template yield \
  --agent-id 0x0000000000000000000000000000000000000000000000000000000000000042
```

### Generated Structure

```
my-agent/
├── Cargo.toml           # Workspace manifest
├── agent/               # Agent logic + kernel binding
│   ├── Cargo.toml
│   ├── build.rs         # AGENT_CODE_HASH computation
│   └── src/lib.rs       # agent_main() + agent_entrypoint! macro
├── tests/               # Test harness
│   ├── Cargo.toml
│   └── src/lib.rs
└── dist/
    └── agent-pack.json  # Agent manifest
```

After scaffolding, add the new crates to your workspace `Cargo.toml`:

```toml
[workspace]
members = [
    # ...existing members...
    "crates/agents/my-agent/agent",
    "crates/agents/my-agent/tests",
]
```

## `cargo agent build`

Build an agent crate.

```
cargo agent build <NAME> [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--release` | false | Build in release mode |

```bash
cargo agent build my-agent
cargo agent build my-agent --release
```

Internally runs `cargo build -p <NAME>` from the workspace root.

## `cargo agent test`

Run agent tests.

```
cargo agent test <NAME> [-- <EXTRA_ARGS>...]
```

Extra arguments are passed through to `cargo test`:

```bash
cargo agent test my-agent
cargo agent test my-agent -- --nocapture
cargo agent test my-agent -- test_supply
```

Internally runs `cargo test -p <NAME>` from the workspace root.

## `cargo agent pack`

Verify the agent manifest (wraps `agent-pack verify`).

```
cargo agent pack <NAME> [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--version <VER>` | `0.1.0` | Agent version for the manifest |

```bash
cargo agent pack my-agent
```

Checks `<agent-dir>/dist/agent-pack.json` for structural validity. For full bundle creation with ELF, use the `agent-pack` CLI directly.

## `cargo agent list`

List all agents in `crates/agents/`.

```bash
cargo agent list
```

Output:

```
Agents (2):
  defi-yield-farmer
  example-yield-agent
```

## Typical Workflow

```bash
# 1. Create a new agent
cargo agent new my-defi-agent --template yield

# 2. Add to workspace Cargo.toml members

# 3. Edit agent logic
$EDITOR crates/agents/my-defi-agent/agent/src/lib.rs

# 4. Build
cargo agent build my-defi-agent

# 5. Test
cargo agent test my-defi-agent

# 6. Verify manifest
cargo agent pack my-defi-agent

# 7. List all agents
cargo agent list
```
