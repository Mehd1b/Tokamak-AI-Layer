---
title: "Tutorial: DeFi Yield Farmer"
sidebar_position: 4
---

# Tutorial: DeFi Yield Farmer

**What you'll build:** A verifiable yield farming agent that manages capital allocation on AAVE V3 lending pools. The agent evaluates supply rates, decides whether to deposit or withdraw, and produces cryptographic proofs of every decision.

## Prerequisites

- tal CLI installed (`tal doctor` passes)
- Completed the [5-Minute Quickstart](/quickstart) (recommended)

## Step 1: Scaffold the agent

```bash
tal init defi-farmer --template yield
```

## Step 2: Implement the strategy

Open `my-agent/agent/src/lib.rs` (the path is printed by `tal init`) and replace the contents with the yield farming logic below.

### Define the inputs

The agent receives a market snapshot from the vault operator. Use the `agent_input!` macro to declare the expected fields:

```rust
use kernel_sdk::prelude::*;

kernel_sdk::agent_input! {
    struct MarketInput {
        lending_pool: [u8; 20],         // AAVE V3 pool address
        asset_token: [u8; 20],          // Token to supply (e.g., DAI)
        vault_balance: u64,             // Idle capital in the vault (wei)
        supplied_amount: u64,           // Capital already supplied to AAVE
        supply_rate_bps: u32,           // Current AAVE supply rate (basis points)
        min_supply_rate_bps: u32,       // Minimum acceptable rate
        target_utilization_bps: u32,    // Target % of capital to deploy (e.g., 8000 = 80%)
        action_flag: u8,               // 0 = evaluate, 1 = force supply, 2 = force withdraw
    }
}
```

All integers use little-endian encoding. Basis points: 100 bps = 1%, 10000 bps = 100%.

### Implement the decision logic

The agent operates in three modes:

| `action_flag` | Mode | Behavior |
|---------------|------|----------|
| 0 | Evaluate | Compare supply rate against minimum threshold, then supply or withdraw |
| 1 | Force Supply | Supply all idle capital regardless of rate |
| 2 | Force Withdraw | Withdraw all supplied capital regardless of rate |

```rust
use kernel_sdk::actions::{CallBuilder, erc20};

pub extern "Rust" fn agent_main(
    _ctx: &AgentContext,
    opaque_inputs: &[u8],
) -> AgentOutput {
    let input = match MarketInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    let actions = match input.action_flag {
        1 => supply_actions(&input, input.vault_balance),
        2 => withdraw_actions(&input, input.supplied_amount),
        _ => evaluate(&input),
    };

    AgentOutput { actions }
}

fn evaluate(input: &MarketInput) -> Vec<Action> {
    let total = input.vault_balance.saturating_add(input.supplied_amount);
    let target = (total as u128 * input.target_utilization_bps as u128 / 10_000) as u64;

    if input.supply_rate_bps >= input.min_supply_rate_bps && input.vault_balance > 0 {
        // Rate is good -- supply up to the target
        let amount = input.vault_balance.min(target.saturating_sub(input.supplied_amount));
        if amount > 0 { supply_actions(input, amount) } else { Vec::new() }
    } else if input.supply_rate_bps < input.min_supply_rate_bps && input.supplied_amount > 0 {
        // Rate too low -- withdraw everything
        withdraw_actions(input, input.supplied_amount)
    } else {
        Vec::new()
    }
}
```

### Build the on-chain actions

```rust
fn supply_actions(input: &MarketInput, amount: u64) -> Vec<Action> {
    // Approve AAVE pool to spend tokens
    let approve = erc20::approve(&input.asset_token, &input.lending_pool, amount);

    // Call supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
    let supply = CallBuilder::new(input.lending_pool)
        .selector(0x617ba037)
        .param_address(&input.asset_token)
        .param_u256_from_u64(amount)
        .param_address(&[0u8; 20])
        .param_u16(0)
        .build();

    vec![approve, supply]
}

fn withdraw_actions(input: &MarketInput, amount: u64) -> Vec<Action> {
    // Call withdraw(address asset, uint256 amount, address to)
    let withdraw = CallBuilder::new(input.lending_pool)
        .selector(0x69328dec)
        .param_address(&input.asset_token)
        .param_u256_from_u64(amount)
        .param_address(&[0u8; 20])
        .build();

    vec![withdraw]
}
```

Finally, register the entry point:

```rust
const _: AgentEntrypoint = agent_main;
kernel_sdk::agent_entrypoint!(agent_main);
```

## Step 3: Test locally

```bash
tal test --local
```

This verifies input parsing, all three strategy branches, ABI encoding, and determinism.

## Step 4: Build

```bash
tal build --elf
```

## Step 5: Deploy to testnet

```bash
cp .env.example .env
# Edit .env with your private key and RPC URL

tal deploy --testnet
```

## Step 6: Verify it worked

```bash
tal monitor --vault <VAULT_ADDRESS> --chain 998
```

You should see the vault status, the registered agent `IMAGE_ID`, and any executed actions.

## AAVE V3 Sepolia addresses

If you are testing on Sepolia, use these contract addresses:

| Contract | Address |
|----------|---------|
| AAVE V3 Pool | [`0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951`](https://sepolia.etherscan.io/address/0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951) |
| DAI | [`0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357`](https://sepolia.etherscan.io/address/0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357) |
| USDC | [`0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8`](https://sepolia.etherscan.io/address/0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8) |
| WETH | [`0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c`](https://sepolia.etherscan.io/address/0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c) |

## Next steps

- [Writing an Agent](/sdk/writing-an-agent) -- Full agent development guide
- [CallBuilder & ERC20 Helpers](/sdk/call-builder) -- Action construction API
- [Constraints](/sdk/constraints-and-commitments) -- Position limits, leverage bounds
- [Deployment Guide](/sdk/deploy-guide) -- Full `tal deploy` reference
