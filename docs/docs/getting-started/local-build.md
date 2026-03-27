---
title: Building from Source
sidebar_position: 2
---

# Building from Source

:::tip Most users don't need this page
If you installed `tal` via `curl` or `cargo install tal-cli`, you already have everything you need. Use `tal build` and `tal build --elf` to compile your agents. This page is for contributors who want to build the full Execution Kernel workspace from a cloned repository.
:::

**What you'll do:** Clone the repository and build all Execution Kernel crates locally.

## Prerequisites

- Rust toolchain (`rustup`)
- tal CLI (optional but recommended)

## Steps

```bash
# Clone the repository
git clone https://github.com/tokamak-network/Tokamak-AI-Layer.git
cd Tokamak-AI-Layer

# Build all crates (no zkVM features)
cargo build --release

# Build with zkVM support (requires RISC Zero toolchain)
cargo build --release --features risc0

# For reproducible builds (required for production)
RISC0_USE_DOCKER=1 cargo build --release --features risc0
```

## Verify it worked

```bash
cargo test
```

All tests should pass. If you see `risc0 not found`, run `tal doctor --install` to install the RISC Zero toolchain.

## Common build errors

| Error | Fix |
|-------|-----|
| `could not find risc0` | Run `tal doctor --install` |
| `linking with cc failed` | Install a C compiler: `xcode-select --install` (macOS) or `sudo apt-get install build-essential` (Linux) |
| `memory allocation failed` | Reduce parallelism: `CARGO_BUILD_JOBS=2 cargo build --release` |
| `docker is not available` | Install and start Docker, then retry with `RISC0_USE_DOCKER=1` |

## Next steps

- [Run the examples](/getting-started/run-an-example)
- [Architecture Overview](/architecture/overview)
- [Writing an Agent](/sdk/writing-an-agent)
