---
title: Repository Map
sidebar_position: 3
---

# Repository Map

A complete guide to the Tokamak AI Layer repository structure, key files, build commands, and test suite.

## Directory Structure

```
Tokamak-AI-Layer/
├── contracts/                      # Foundry project - Solidity smart contracts
│   ├── src/
│   │   ├── core/                   # Core protocol contracts
│   │   │   ├── TALIdentityRegistry.sol       # ERC-721 agent identity (905 lines)
│   │   │   ├── TALReputationRegistry.sol     # Feedback aggregation (717 lines)
│   │   │   ├── TALValidationRegistry.sol     # Multi-model validation + V3 features (1112 lines)
│   │   │   ├── WSTONVault.sol               # L2 WSTON locking + slashing (280 lines)
│   │   │   └── TaskFeeEscrow.sol             # Non-upgradeable task fee escrow (193 lines)
│   │   ├── bridge/                 # L1 <-> L2 cross-layer bridge
│   │   │   ├── TALStakingBridgeL2.sol        # L2 stake cache, tier management
│   │   │   ├── TALStakingBridgeL1.sol        # L1 stake queries, relay
│   │   │   └── TALSlashingConditionsL1.sol    # L1 slashing execution
│   │   ├── modules/                # Integration modules
│   │   │   ├── DRBIntegrationModule.sol      # Commit-Reveal2 validator selection
│   │   │   └── StakingIntegrationModule.sol  # Stake queries, seigniorage
│   │   ├── interfaces/             # Contract interfaces (14 files)
│   │   └── libraries/              # Shared libraries
│   │       ├── ReputationMath.sol            # Score normalization, weighted averages
│   │       └── SlashingCalculator.sol        # Slashing percentage calculations
│   ├── test/
│   │   ├── unit/                   # Unit tests per contract
│   │   ├── integration/            # Cross-layer, StakeSecured, TEE tests
│   │   └── GasBenchmarks.t.sol     # Gas usage benchmarks
│   └── script/                     # Deployment scripts (Sepolia, Local, L1)
│
├── sdk/                            # TypeScript SDK
│   └── src/
│       ├── TALClient.ts            # Main facade (580 lines)
│       ├── identity/               # IdentityClient, RegistrationBuilder
│       ├── reputation/             # ReputationClient
│       ├── validation/             # ValidationClient
│       ├── zk/                     # ProofGenerator (STUBBED)
│       ├── subgraph/               # SubgraphClient (STUBBED)
│       ├── abi/                    # Contract ABIs (8 files, including V2/V3 ABIs)
│       ├── types/                  # TypeScript type definitions
│       └── __tests__/              # SDK tests
│
├── frontend/                       # Next.js 14 web application
│   └── src/
│       ├── app/                    # App Router pages
│       │   ├── page.tsx            # Landing page
│       │   ├── providers.tsx       # wagmi + RainbowKit providers
│       │   ├── agents/             # /agents, /agents/[id], /agents/register, /agents/fees
│       │   ├── reputation/         # /reputation/[agentId]
│       │   ├── validation/         # /validation, /validation/[hash], /validation/request
│       │   ├── staking/            # /staking
│       │   └── api/                # API routes (IPFS upload, runtime proxy)
│       ├── components/             # Shared UI components
│       ├── hooks/                  # Custom React hooks (14 files)
│       └── lib/                    # Contract addresses, utilities
│
├── agent-examples/                 # Example AI agent implementations
│   ├── solidity-auditor/           # Express.js Solidity audit agent
│   │   └── src/
│   │       ├── routes/             # Task submission, validation endpoints
│   │       └── agents/             # Agent implementations
│   │
│   ├── trading-agent/              # DeFi trading agent (pnpm monorepo)
│   │   └── packages/
│   │       ├── agent-core/         # Core logic: analysis, execution, lending, strategy
│   │       ├── agent-server/       # Agent server
│   │       ├── shared/             # Shared types and ABIs
│   │       ├── siwa-auth/          # Sign-In With Agent authentication
│   │       └── tal-integration/    # TAL protocol integration
│   │
│   └── yield-agent/                # TAL Yield Agent (monorepo)
│       └── packages/
│           ├── agent-core/         # Core yield agent logic
│           ├── agent-server/       # Agent server implementation
│           ├── agent-worker/       # Background worker
│           ├── shared/             # Shared types and ABIs
│           └── tal-sdk/            # Agent-specific SDK wrapper
│
├── docs/                           # Docusaurus documentation site
│   └── docs/                       # Documentation pages
│       ├── intro.md                # Introduction
│       ├── architecture/           # System architecture docs
│       ├── contracts/              # Smart contract docs
│       ├── sdk/                    # SDK documentation
│       ├── app/                    # Frontend app docs
│       ├── integration/            # Integration guides
│       └── reference/              # Glossary, contracts, repo map
│
└── README.md                       # Project README
```

## Key Files by Component

### Smart Contracts

| File | Purpose | Lines |
|------|---------|-------|
| `contracts/src/core/TALIdentityRegistry.sol` | Agent identity NFTs, ZK commitments, operators | 905 |
| `contracts/src/core/TALReputationRegistry.sol` | Feedback aggregation, payment proofs, Merkle trees | 717 |
| `contracts/src/core/TALValidationRegistry.sol` | Multi-model validation, epoch stats, dual-staking, automated slashing | 1,112 |
| `contracts/src/core/WSTONVault.sol` | L2 WSTON locking, operator tiers, slashing execution | 280 |
| `contracts/src/core/TaskFeeEscrow.sol` | Non-upgradeable native TON task fee escrow | 193 |
| `contracts/src/bridge/TALStakingBridgeL2.sol` | L2 cache of L1 stake data | -- |
| `contracts/src/bridge/TALStakingBridgeL1.sol` | L1 stake queries, cross-domain relay | -- |
| `contracts/src/modules/DRBIntegrationModule.sol` | Decentralized random beacon for validator selection | -- |
| `contracts/src/modules/StakingIntegrationModule.sol` | Stake queries, slashing, seigniorage | -- |
| `contracts/src/libraries/ReputationMath.sol` | Score normalization, weighted averages | -- |
| `contracts/src/libraries/SlashingCalculator.sol` | Slashing percentage calculations | -- |

### SDK

| File | Purpose |
|------|---------|
| `sdk/src/TALClient.ts` | Main facade wrapping all domain clients (580 lines) |
| `sdk/src/identity/IdentityClient.ts` | Identity registration and querying |
| `sdk/src/identity/RegistrationBuilder.ts` | Fluent builder for ERC-8004 registration files |
| `sdk/src/reputation/ReputationClient.ts` | Reputation queries and feedback submission |
| `sdk/src/validation/ValidationClient.ts` | Validation request and response management |
| `sdk/src/types/index.ts` | All TypeScript type definitions (444 lines) |
| `sdk/src/abi/TALIdentityRegistry.ts` | Identity registry ABI |
| `sdk/src/abi/TALIdentityRegistryV2.ts` | Identity registry V2 ABI |
| `sdk/src/abi/TALIdentityRegistryV3.ts` | Identity registry V3 ABI |
| `sdk/src/abi/TALReputationRegistry.ts` | Reputation registry ABI |
| `sdk/src/abi/TALValidationRegistry.ts` | Validation registry ABI |
| `sdk/src/abi/TALValidationRegistryV2.ts` | Validation registry V2 ABI |
| `sdk/src/abi/TALValidationRegistryV3.ts` | Validation registry V3 ABI |
| `sdk/src/abi/TaskFeeEscrow.ts` | Task fee escrow ABI |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/app/providers.tsx` | wagmi, React Query, RainbowKit provider setup |
| `frontend/src/lib/contracts.ts` | All contract addresses (L1 + L2) and chain IDs |
| `frontend/src/hooks/useAgent.ts` | Agent read hooks (single, count, list, by-owner) |
| `frontend/src/hooks/useAgentMetadata.ts` | IPFS metadata fetching with gateway fallback |
| `frontend/src/hooks/useAgentRuntime.ts` | Agent runtime API communication |
| `frontend/src/hooks/useDeregisterAgent.ts` | Agent deregistration write hook |
| `frontend/src/hooks/useL2Config.ts` | L2 chain configuration hook |
| `frontend/src/hooks/useOperatorManagement.ts` | Operator add/remove/exit hooks |
| `frontend/src/hooks/useRegisterAgent.ts` | Agent registration write hook |
| `frontend/src/hooks/useReputation.ts` | Reputation read hooks (feedback, summary, ratings) |
| `frontend/src/hooks/useStaking.ts` | L1 staking read/write hooks |
| `frontend/src/hooks/useSubmitFeedback.ts` | Feedback submission write hook |
| `frontend/src/hooks/useTaskFee.ts` | Task fee escrow hooks |
| `frontend/src/hooks/useValidation.ts` | Validation read/write hooks |
| `frontend/src/hooks/useVault.ts` | WSTONVault lock/unlock/slash hooks |
| `frontend/src/hooks/useWallet.ts` | Wallet state and network switching |

## Build Commands

| Component | Command | Description |
|-----------|---------|-------------|
| Contracts | `cd contracts && forge build` | Compile Solidity contracts |
| Contracts | `cd contracts && forge test` | Run all Foundry tests |
| Contracts | `cd contracts && forge test --gas-report` | Run tests with gas reporting |
| SDK | `cd sdk && npm install` | Install SDK dependencies |
| SDK | `cd sdk && npm run build` | Build SDK with tsup |
| SDK | `cd sdk && npm test` | Run vitest test suite |
| Frontend | `cd frontend && npm install` | Install frontend dependencies |
| Frontend | `cd frontend && npm run dev` | Start development server |
| Frontend | `cd frontend && npm run build` | Build production bundle |
| Frontend | `cd frontend && npm run lint` | Run ESLint |
| Frontend | `cd frontend && npm run typecheck` | Run TypeScript type checking |

## Test Suite Summary

| Test File | Type | Tests | Status |
|-----------|------|-------|--------|
| `TALIdentityRegistry.t.sol` | Unit | 83 | Passing |
| `TALReputationRegistry.t.sol` | Unit | 63 | Passing |
| `ReputationMath.t.sol` | Unit | 57 | Passing |
| `TaskFeeEscrow.t.sol` | Unit | 59 | Passing |
| `WSTONVault.t.sol` | Unit | 44 | Passing |
| `DRBIntegrationModule.t.sol` | Unit | 27 | Passing |
| `StakingIntegrationModule.t.sol` | Unit | 28 | Passing |
| `StakeSecuredValidation.t.sol` | Integration | 12 | Passing |
| `TEEAttestedValidation.t.sol` | Integration | 20 | Passing |
| `GasBenchmarks.t.sol` | Benchmark | 11 | Passing |
| SDK tests (4 files) | Unit | 35 | Passing |
| **Total** | | **439** | **All Passing** |

### Gas Benchmarks

| Operation | Gas | Target |
|-----------|-----|--------|
| `register()` | ~143k | Within threshold |
| `submitFeedback()` | ~318k | Within threshold |
| `requestValidation()` | ~277k | Within threshold |

## Design Patterns

| Pattern | Where Used | Purpose |
|---------|-----------|---------|
| UUPS Proxy | Identity, Reputation, Validation registries | Upgradeability without redeployment (V1 → V2 → V3 chain) |
| AccessControl (RBAC) | All core contracts | Role-based permissions (UPGRADER, PAUSER, TEE_MANAGER, DRB, SLASH) |
| Storage Gap | All upgradeable contracts | Versioned gaps (`__gap[40]`, `__gapV2[38]`, `__gapV3[36]`) for future storage slots |
| ReentrancyGuard | State-changing functions | Prevent reentrancy attacks |
| Pausable | All core contracts | Emergency pause functionality |
| Immutable | TaskFeeEscrow, WSTONVault | Non-upgradeable contracts for stronger fund safety |

:::tip Commonly Modified Files
When making changes to the project, these are the most frequently edited files:

- **New contract features**: `contracts/src/core/*.sol` + corresponding test in `contracts/test/`
- **SDK changes**: `sdk/src/TALClient.ts` (facade) + domain clients in `sdk/src/{identity,reputation,validation}/`
- **New types**: `sdk/src/types/index.ts`
- **Frontend pages**: `frontend/src/app/*/page.tsx`
- **Contract hooks**: `frontend/src/hooks/use*.ts`
- **Contract addresses**: `frontend/src/lib/contracts.ts` AND `sdk/src/types/index.ts`
:::
