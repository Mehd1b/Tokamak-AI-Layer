# tal-cli

Unified CLI for the [Tokamak AI Layer](https://github.com/tokamak-network/Tokamak-AI-Layer) — scaffold, validate, test, and deploy verifiable agents on RISC Zero zkVM.

## Install

### From prebuilt binaries (recommended)

```bash
curl -sSL https://raw.githubusercontent.com/tokamak-network/Tokamak-AI-Layer/master/install-tal.sh | sh
```

### From crates.io

```bash
cargo install tal-cli
```

### From source

```bash
git clone https://github.com/tokamak-network/Tokamak-AI-Layer.git
cd Tokamak-AI-Layer
cargo install --path crates/tal-cli
```

## Commands

```
tal init <name>                  Scaffold a new agent project
tal doctor                       Validate toolchain and configuration
tal test [--local|--prove]       Test agent logic
tal build [--elf]                Build agent and/or ELF binary
tal deploy [--testnet]           Deploy agent + vault on-chain
tal monitor --vault <addr>       Live execution dashboard
```

## Quick Start

```bash
# Create a new agent from a template
tal init my-agent --template minimal

# Validate your environment
tal doctor

# Run tests locally (instant feedback, no zkVM)
tal test --local --agent my-agent

# Build zkVM ELF binary (requires RISC Zero toolchain)
tal build --elf --agent my-agent

# Deploy to HyperEVM testnet
tal deploy --testnet --agent my-agent

# Monitor vault state
tal monitor --vault 0x...
```

## Configuration

Create a `.env` file (or use `--config <path>`):

```env
CHAIN_ID=999
RPC_URL=https://your-rpc-url
PRIVATE_KEY=0x...
VAULT_ADDRESS=0x...
```

## Supported Chains

| Chain | ID | Status |
|-------|-----|--------|
| HyperEVM Mainnet | 999 | Supported |
| HyperEVM Testnet | 998 | Supported |

## License

MIT OR Apache-2.0
