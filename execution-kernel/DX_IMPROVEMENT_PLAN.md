# Execution Kernel — Developer Experience Improvement Plan

## Executive Summary

The Execution Kernel has strong protocol design. Phases 1-3 addressed the worst DX pain points: critical SDK bugs, address duplication, the three-crate boilerplate tax, and manual byte parsing. The remaining phases focus on testing ergonomics, CLI tooling, and documentation.

**Goal**: Reduce agent creation from 4-6 hours to 15 minutes. Fix critical SDK bugs. Create a single `cargo agent` workflow.

---

## Completed Work

### Phase 1: Critical Bug Fixes -- DONE

All SDK data-loss bugs fixed, type safety restored, addresses unified.

| Fix | Files | Impact |
|-----|-------|--------|
| Event parsing (vault) | `KernelVaultClient.ts` | `depositERC20`, `depositETH`, `withdraw` now use `decodeEventLog`. Previously all returned `0n`. |
| Event parsing (registry) | `AgentRegistryClient.ts`, `VaultFactoryClient.ts` | Replaced raw topic extraction with `decodeEventLog`. Throws on missing events instead of returning `'0x'`. |
| Type safety | `types.ts` | `walletClient?: any` / `publicClient?: any` replaced with proper viem types. Address fields made optional. |
| Address unification | New `addresses.ts`, updated `types.ts`, `frontend/contracts.ts` | Single source of truth in `sdk/src/addresses.ts`. Frontend imports via `@ek-sdk/*` alias. |
| ABI deduplication | `frontend/contracts.ts`, SDK ABIs | Frontend's 465-line inline ABIs replaced with SDK imports. Added missing functions to SDK ABIs. |
| Test updates | 3 test files | Mocks updated to use `encodeEventTopics`/`encodeAbiParameters` for proper ABI-encoded logs. |

**Result**: 57/57 SDK tests passing, frontend builds cleanly.

---

### Phase 2: Eliminate the Three-Crate Tax -- DONE

The `agent_entrypoint!` macro eliminates the entire binding crate. Per-agent structure reduced from 3 crates to 2.

| Change | Files | Impact |
|--------|-------|--------|
| `agent_entrypoint!` macro | `kernel-sdk/src/lib.rs` | Generates `AgentEntrypoint` impl + `kernel_main` export from a single macro call |
| Migrate example-yield-agent | `agent/{Cargo.toml,src/lib.rs}`, `risc0-methods/zkvm-guest/{Cargo.toml,src/main.rs}` | Deleted entire `binding/` crate |
| Migrate defi-yield-farmer | `agent/{Cargo.toml,src/lib.rs}`, `risc0-methods/zkvm-guest-defi/{Cargo.toml,src/main.rs}` | Deleted entire `binding/` crate |
| Update host tests + workspace | `kernel-host-tests/{Cargo.toml,src/lib.rs}`, root `Cargo.toml` | Removed binding crate references |
| Update agent-pack scaffold | `agent-pack/src/scaffold.rs` | Templates generate 2-crate structure |

**New agent structure** (was 3 crates, now 2):
```
my-agent/
├── agent/
│   ├── Cargo.toml
│   ├── build.rs          # AGENT_CODE_HASH (unchanged)
│   └── src/lib.rs         # agent_main() + agent_entrypoint!(agent_main)
└── risc0-methods/
    ├── Cargo.toml
    ├── build.rs
    └── zkvm-guest/
        ├── Cargo.toml
        └── src/main.rs    # Now imports directly from agent crate
```

**Result**: 291 tests passing across all crates. 0 warnings. ~12 boilerplate files eliminated per agent.

---

### Phase 3: Input/Output DX -- DONE

Replaced manual byte parsing with `agent_input!` declarative macro and `CallBuilder` fluent builder. Both existing agents migrated with byte-identical output verified.

| Change | Files | Impact |
|--------|-------|--------|
| Byte helpers | `kernel-sdk/src/bytes.rs` | Added `read_u16_le`, `read_bytes20`, `read_u16_le_at`, `read_bytes20_at`, `write_u16_le`. 5 new tests. |
| `agent_input!` macro | `kernel-sdk/src/lib.rs` | Declarative macro supporting 7 types (`u8`, `u16`, `u32`, `u64`, `bool`, `[u8; 20]`, `[u8; 32]`). Generates struct + `decode()` + `ENCODED_SIZE`. 7 new tests. |
| `CallBuilder` + `erc20` module | `kernel-sdk/src/actions.rs` | Fluent builder for CALL actions. `erc20::approve`, `erc20::transfer`, `erc20::transfer_from` prebuilt helpers. 13 new tests. |
| Migrate defi-yield-farmer | `agent/src/lib.rs` | Replaced ~57 lines of manual parsing with 10-line `agent_input!` call. Replaced `encode_approve_call`, `encode_supply_call`, `encode_withdraw_call`, `u64_to_u256_be` with `CallBuilder` + `erc20::approve`. All 16 tests pass. |
| Migrate example-yield-agent | `agent/src/lib.rs` | Replaced manual parsing with `agent_input!`, replaced `encode_withdraw_call` with `CallBuilder`. All 7 tests pass. |
| Update scaffold templates | `agent-pack/src/scaffold.rs` | Minimal template includes commented `agent_input!` + `CallBuilder` examples. Yield template uses both. |
| Prelude exports | `kernel-sdk/src/lib.rs` | Added `read_u16_le`, `read_bytes20`, `read_u16_le_at`, `read_bytes20_at`, `CallBuilder` to prelude. |

**Example -- before and after**:
```rust
// BEFORE: ~57 lines of manual parsing + encoding
fn parse_input(bytes: &[u8]) -> Option<MarketInput> {
    if bytes.len() != 89 { return None; }
    let mut offset = 0;
    let mut lending_pool = [0u8; 20];
    lending_pool.copy_from_slice(&bytes[offset..offset + 20]);
    offset += 20;
    // ... 25 more lines of copy_from_slice
}
fn encode_supply_call(asset: &[u8; 20], amount: u64, vault: &[u8; 20]) -> Vec<u8> {
    let mut calldata = Vec::with_capacity(132);
    calldata.extend_from_slice(&[0x61, 0x7b, 0xa0, 0x37]);
    // ... manual ABI encoding
}

// AFTER: 10 lines + builder calls
agent_input! {
    struct MarketInput {
        lending_pool: [u8; 20],
        asset_token: [u8; 20],
        vault_address: [u8; 20],
        vault_balance: u64,
        supplied_amount: u64,
        supply_rate_bps: u32,
        min_supply_rate_bps: u32,
        target_utilization_bps: u32,
        action_flag: u8,
    }
}
let action = CallBuilder::new(&lending_pool)
    .selector(0x617ba037)
    .param_address(&asset_token)
    .param_u256(amount)
    .param_address(&vault_address)
    .param_u16(0)
    .build();
```

**Result**: 291 tests passing. 0 failures, 0 warnings. Byte-identical output verified for all migrated agents.

---

### Phase 4: Testing DX -- DONE

Replaced ~30 lines of manual test boilerplate per test with a `kernel_sdk::testing` module providing `TestHarness`, `ContextBuilder`, `TestResult`, `KernelTestResult`, hex helpers, and snapshot testing.

| Change | Files | Impact |
|--------|-------|--------|
| `_agent_input_write!` macro + `encode()` | `kernel-sdk/src/lib.rs` | `agent_input!` structs now have `encode()` method (inverse of `decode()`). 4 roundtrip tests. |
| `std` + `testing` features | `kernel-sdk/Cargo.toml` | `std` enables conditional `no_std`, `testing` adds `constraints` dep + testing module. |
| Conditional `no_std` | `kernel-sdk/src/lib.rs` | `#![cfg_attr(not(feature = "std"), no_std)]` — production builds remain `no_std`. |
| `testing` module | New `kernel-sdk/src/testing.rs` | `TestHarness`, `ContextBuilder`, `TestResult`, `KernelTestResult`, hex helpers (`addr`, `bytes32`, `hex_bytes`), snapshot testing (`assert_snapshot` behind `std`). 21 new tests. |
| Agent dev-dependencies | `defi-yield-farmer/agent/Cargo.toml`, `example-yield-agent/agent/Cargo.toml` | `kernel-sdk` with `testing,std` features in `[dev-dependencies]`. |

**Example -- before and after**:
```rust
// BEFORE: ~30 lines per test
#[test]
fn test_my_agent() {
    let ctx = AgentContext::new(1, 1, [0x42; 32], [0; 32], [0; 32], [0; 32], 1);
    let mut input = Vec::with_capacity(89);
    input.extend_from_slice(&[0x11u8; 20]); // lending_pool
    input.extend_from_slice(&[0x22u8; 20]); // asset_token
    // ... 10 more lines of manual encoding
    let output = agent_main(&ctx, &input);
    assert_eq!(output.actions.len(), 2);
    assert_eq!(output.actions[0].action_type, 0x00000002);
}

// AFTER: ~5 lines
#[test]
fn test_my_agent() {
    let result = TestHarness::new()
        .agent_id(bytes32("0x42"))
        .input(my_input.encode())
        .execute(agent_main);

    result.assert_action_count(2);
    result.assert_action_type(0, ACTION_TYPE_CALL);
}
```

**Result**: 304 tests passing (was 291). 0 regressions. Production `no_std` build unaffected.

---

### Phase 5: SDK & Frontend Cleanup -- DONE

Environment config, frontend optimization, and `cargo agent` CLI.

| Change | Files | Impact |
|--------|-------|--------|
| `.env.example` | `contracts/.env.example` | Documented placeholder env file; prevents accidental key exposure |
| Vault N+1 fix | `frontend/src/hooks/useVaultFactory.ts` | Replaced 4N+1 individual `readContract` calls with 2 `multicall` batches (1 for core fields, 1 for TVL). `useVaultsForAgent` now derives from `useDeployedVaultsList` cache instead of fetching independently. |
| `VaultInfo` type | `frontend/src/hooks/useVaultFactory.ts` | Exported shared interface for vault data consumed by VaultCard and pages |
| `cargo-agent` CLI | New `crates/tools/cargo-agent/` | Cargo subcommand: `cargo agent new`, `build`, `test`, `pack`, `list`. Wraps `agent-pack` scaffold. |
| Workspace registration | `Cargo.toml` | Added `crates/tools/cargo-agent` to workspace members |

**Usage**:
```bash
cargo install --path crates/tools/cargo-agent
cargo agent list                            # List existing agents
cargo agent new my-agent                    # Scaffold minimal agent
cargo agent new my-agent --template yield   # With yield template
cargo agent build my-agent                  # Build agent crate
cargo agent test my-agent                   # Run agent tests
cargo agent pack my-agent                   # Verify manifest
```

**Result**: Frontend builds cleanly. 57/57 SDK tests passing. All Rust tests passing. 0 regressions.

---

## Remaining Work

### Phase 6: Documentation & Onboarding (1-2 days)

#### 6.1 Quickstart Guide

Create `docs/QUICKSTART.md`:

```markdown
# Build Your First Agent in 5 Minutes

## Prerequisites
- Rust 1.80+ (`rustup update`)
- RISC Zero CLI (`cargo install cargo-risczero && cargo risczero install`)

## Steps

1. Create a new agent:
   cargo agent new hello-world

2. Edit your agent logic:
   $EDITOR crates/agents/hello-world/agent/src/lib.rs

3. Test it:
   cargo agent test hello-world

4. Build a zkVM proof:
   cargo agent build hello-world --prove

5. Deploy:
   cargo agent register hello-world --rpc $RPC_URL
```

#### 6.2 Agent Cookbook

Create `docs/COOKBOOK.md` with recipes for:
- ERC20 token operations (approve, transfer, swap)
- DeFi lending (AAVE supply/withdraw)
- Multi-action transactions
- Reading oracle data
- Error handling patterns
- Testing strategies

#### 6.3 Architecture Decision Records

Create `docs/adr/` with records explaining:
- ADR-001: Why three-crate pattern became two-crate (and migration to macro)
- ADR-002: Why manual codec (determinism)
- ADR-003: Why AGENT_CODE_HASH exists (P0.5 binding)
- ADR-004: Why constraints are unskippable (P0.3)

---

## Implementation Priority

| Phase | Effort | Impact | Priority | Status |
|-------|--------|--------|----------|--------|
| Phase 1: Bug Fixes | 1-2 days | Critical (data loss) | P0 | **DONE** |
| Phase 2: Eliminate Three-Crate Tax | 3-5 days | Highest (DX transformation) | P1 | **DONE** |
| Phase 3: Input/Output macros + builders | 2-3 days | High (removes manual parsing) | P1 | **DONE** |
| Phase 4: Testing DX | 2 days | High (testing ergonomics) | P2 | **DONE** |
| Phase 5: SDK/Frontend cleanup + CLI | 2-3 days | Medium (quality + workflow) | P2 | **DONE** |
| Phase 6: Documentation | 1-2 days | High (onboarding) | P2 | TODO |

**Completed**: ~12-15 days of work across Phases 1-5
**Remaining**: ~1-2 days for Phase 6

---

## Success Metrics

| Metric | Before | After Phase 1-5 | Target |
|--------|--------|-----------------|--------|
| Time to create new agent | 4-6 hours | **~15 min (cargo agent new)** | 15 minutes |
| Crates per agent | 3 | **2** | 2 |
| Files to create for new agent | 12 | **0 (scaffolded by CLI)** | ~6 (with CLI) |
| Lines of boilerplate per agent | ~150 | **~15** | ~10 |
| Lines of agent-specific input parsing | ~30-57 | **~10 (agent_input!)** | ~10 |
| Lines of action encoding | ~20-30 | **~5 (CallBuilder)** | ~5 |
| Lines of test boilerplate per test | ~30 | **~5 (TestHarness)** | ~5 |
| SDK bugs (data-loss severity) | 4 | **0** | 0 |
| Address source-of-truth locations | 3 | **1** | 1 |
| Frontend RPC calls per vault list | 4N+1 | **3 (multicall)** | ~1-3 |
| Steps to deploy agent | 6 manual | **5 (cargo agent new/build/test/pack)** | 1 command |
| Total tests passing | 35 SDK | **57 SDK + 304+ Rust** | 300+ |

---

## What NOT to Do

- Don't rewrite kernel-core or kernel-guest (they're correct and well-designed)
- Don't add serde to the protocol layer (determinism constraint)
- Don't add complex IDL/protobuf -- the derive macro is sufficient for fixed-size inputs
- Don't build an agent marketplace yet -- focus on making one agent easy first
