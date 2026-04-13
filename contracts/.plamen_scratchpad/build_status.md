# Build Status

## Build Result
**Status**: SUCCESS
**Command**: `forge build` (in `/Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/contracts`)
**Solc**: 0.8.24
**Files compiled**: 36 source files (4.38s)

## Warnings (non-blocking)
- `src/adapters/HyperliquidAdapter.sol:245` — `closePosition()` state mutability can be `pure`
- `src/adapters/HyperliquidAdapter.sol:312` — `closePositionAdmin()` state mutability can be `pure`

## Tool Availability
- **MEDUSA_AVAILABLE**: false (command not found)
- **SLITHER_AVAILABLE**: false (no slither CLI or Python package)
- **RAG_TOOLS_AVAILABLE**: false (no MCP unified-vuln-db)
- **FOUNDRY**: available

## Repo Shape
- **Git commit count**: 302
- **REPO_SHAPE**: normal_dev

## Compile Weight
- **Source files (src/ only)**: 34 .sol files
- **COMPILE_WEIGHT**: moderate

## Submodules
- `lib/forge-std` — present
- `lib/risc0-ethereum` — present (provides OpenZeppelin)

## Foundry Profiles
- `[profile.default]`: optimizer_runs=200, via_ir=false
- `[profile.small]`: optimizer_runs=1, via_ir=true, cbor_metadata=false, bytecode_hash="none" (HyperEVM)
- `[profile.compact]`: optimizer_runs=1, cbor_metadata=false, bytecode_hash="none"
- `[profile.test_medium]`: optimizer_runs=200, via_ir=true
