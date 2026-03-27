---
title: SDK Overview
sidebar_position: 1
---

# Kernel SDK Overview

The Kernel SDK is the Rust toolkit for building agents that run inside the Tokamak zkVM. Everything you need to go from idea to deployed, provable agent.

## What the SDK Provides

- **Agent framework** -- macros and types for writing deterministic agent logic (`agent_main`, `agent_input!`, `agent_entrypoint!`)
- **Action builders** -- fluent APIs for constructing on-chain calls and ERC20 operations (`CallBuilder`, `erc20::approve/transfer`)
- **Test harness** -- test your agent at every level, from unit tests to full ZK proofs, using `tal test`

## Crate Structure

```
kernel-sdk
  |-- agent_input!         Parse fixed-size inputs from bytes
  |-- agent_entrypoint!    Bind your agent to the kernel
  |-- CallBuilder          Build contract call actions
  |-- erc20 helpers        approve / transfer / transferFrom
  |-- TestHarness          Test agents with minimal boilerplate
  |-- math utilities       Checked arithmetic, basis-point helpers
```

## Quick Start

```bash
# Scaffold a new agent project
tal init my-agent --template yield

# Run tests
tal test --local

# Build the zkVM binary
tal build --elf

# Deploy to testnet
tal deploy --testnet
```

## React Hooks (`@tokamak/execution-kernel-sdk/react`)

The SDK also provides React hooks for building vault frontends. Install with:

```bash
npm install @tokamak/execution-kernel-sdk viem wagmi @tanstack/react-query
```

Wrap your app in `TokamakProvider`:

```tsx
import { TokamakProvider } from '@tokamak/execution-kernel-sdk/react';

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <TokamakProvider>
          <YourApp />
        </TokamakProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

**Available hooks:**

| Hook | Purpose |
|------|---------|
| `useVault(address)` | Read vault info (TVL, shares, asset, agentId) |
| `useVaultList()` | List all deployed vaults |
| `useUserShares(address)` | User's shares and asset value in a vault |
| `useAgent(agentId)` | Read agent info (author, imageId, codeHash) |
| `useAgentList()` | List all registered agents |
| `useDeposit(vault, asset)` | Stateful approve-then-deposit flow with step tracking |
| `useWithdraw(vault)` | Stateful withdraw flow |
| `useIsLegacyChain()` | Auto-detect HyperEVM legacy gas requirement |
| `useChainMismatch(chainId)` | Check if wallet is on the wrong chain |

**Typed errors:**

```tsx
import { TokamakError, ErrorCode } from '@tokamak/execution-kernel-sdk';

try {
  await deposit(amount);
} catch (err) {
  const error = TokamakError.from(err);
  switch (error.code) {
    case ErrorCode.USER_REJECTED: // user cancelled
    case ErrorCode.INSUFFICIENT_BALANCE: // not enough funds
    case ErrorCode.STRATEGY_ACTIVE: // vault locked
  }
}
```

## Next Steps

- [Build Your First Agent](/sdk/writing-an-agent) -- step-by-step tutorial
- [`agent_input!` Macro](/sdk/agent-input-macro) -- declarative input parsing
- [CallBuilder & ERC20 Helpers](/sdk/call-builder) -- fluent action construction
- [Testing](/sdk/testing) -- test at every level with `tal test`
- [`tal` CLI Reference](/sdk/cli-reference) -- full command reference
