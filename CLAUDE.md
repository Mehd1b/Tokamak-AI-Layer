# Tokamak AI Layer (TAL) - Project Reference

## PROJECT OVERVIEW

**Tokamak AI Layer (TAL)** - ERC-8004 compliant infrastructure layer providing trustless AI agent discovery, reputation management, and execution verification on Tokamak L2 (Optimism-based). Cross-chain staking bridges to Ethereum L1 for economic security via TON Staking V3.

- **Standard**: ERC-8004 (Trustless Agents Standard)
- **Network**: Tokamak L2 (Thanos Sepolia for testnet)
- **Chain ID**: 111551119090 (Thanos Sepolia)

---

## REPOSITORY STRUCTURE

```
Tokamak-AI-Layer/
├── contracts/              # Foundry project - Solidity smart contracts
│   ├── src/
│   │   ├── core/           # Core registries (Identity, Reputation, Validation)
│   │   ├── bridge/         # L1<->L2 cross-layer bridge contracts
│   │   ├── modules/        # Integration modules (DRB, Staking)
│   │   ├── interfaces/     # All contract interfaces (14 files)
│   │   └── libraries/      # ReputationMath, SlashingCalculator
│   ├── test/
│   │   ├── unit/           # Unit tests for each contract
│   │   ├── integration/    # Cross-layer, StakeSecured, TEEAttested tests
│   │   └── GasBenchmarks.t.sol
│   └── script/             # Deployment scripts (Sepolia, Local, L1)
├── sdk/                    # TypeScript SDK
│   └── src/
│       ├── TALClient.ts    # Main facade client
│       ├── identity/       # IdentityClient, RegistrationBuilder
│       ├── reputation/     # ReputationClient
│       ├── validation/     # ValidationClient
│       ├── zk/             # ProofGenerator (STUBBED)
│       ├── subgraph/       # SubgraphClient (STUBBED)
│       ├── abi/            # Contract ABIs
│       ├── types/          # TypeScript type definitions
│       └── __tests__/      # SDK tests
├── frontend/               # Next.js 14 web application
│   └── src/
│       ├── app/            # Pages (landing, agents, reputation, validation, staking)
│       ├── components/     # UI components
│       ├── hooks/          # wagmi contract hooks
│       └── lib/            # Contract addresses, config
├── docs/                   # Technical documentation
│   └── TECHNICAL_SPECIFICATION.md
├── PROPOSAL.md             # Project proposal document
├── DECK_PITCH.md           # Pitch deck
└── README.md               # Main README
```

---

## SMART CONTRACTS

### Core Registries (Tokamak L2)

| Contract | File | Purpose | Lines | Status |
|----------|------|---------|-------|--------|
| TALIdentityRegistry | `contracts/src/core/TALIdentityRegistry.sol` | ERC-721 agent identity NFTs, ZK commitments, operator management | 602 | COMPLETE |
| TALReputationRegistry | `contracts/src/core/TALReputationRegistry.sol` | Stake-weighted feedback aggregation, payment proofs, Merkle trees | 687 | COMPLETE |
| TALValidationRegistry | `contracts/src/core/TALValidationRegistry.sol` | Multi-model validation, TEE attestation, bounty distribution, disputes | 1052 | COMPLETE |

### Bridge Contracts (L1 <-> L2)

| Contract | File | Purpose | Status |
|----------|------|---------|--------|
| TALStakingBridgeL2 | `contracts/src/bridge/TALStakingBridgeL2.sol` | L2 cache of L1 stake data, tier management, slashing requests | COMPLETE |
| TALStakingBridgeL1 | `contracts/src/bridge/TALStakingBridgeL1.sol` | L1 stake queries, relay to L2, operator management | COMPLETE |
| TALSlashingConditionsL1 | `contracts/src/bridge/TALSlashingConditionsL1.sol` | L1 slashing execution, evidence validation | COMPLETE |

### Integration Modules

| Contract | File | Purpose | Status |
|----------|------|---------|--------|
| DRBIntegrationModule | `contracts/src/modules/DRBIntegrationModule.sol` | Commit-Reveal2 wrapper for validator selection | COMPLETE |
| StakingIntegrationModule | `contracts/src/modules/StakingIntegrationModule.sol` | Stake queries, slashing, seigniorage routing | COMPLETE |

### Libraries

| Library | File | Purpose |
|---------|------|---------|
| ReputationMath | `contracts/src/libraries/ReputationMath.sol` | Score normalization, weighted averages |
| SlashingCalculator | `contracts/src/libraries/SlashingCalculator.sol` | Slashing percentage calculations |

### Interfaces (14 files in `contracts/src/interfaces/`)

IERC8004IdentityRegistry, IERC8004ReputationRegistry, IERC8004ValidationRegistry, ITALIdentityRegistry, ITALReputationRegistry, ITALValidationRegistry, ITALStakingBridgeL1, ITALStakingBridgeL2, ITALSlashingConditionsL1, IDRB, IDRBIntegrationModule, IStakingIntegrationModule, IStakingV3, ITEEAttestation

### Design Patterns

- **UUPS Proxy**: All core contracts use OpenZeppelin UUPSUpgradeable
- **RBAC**: AccessControlUpgradeable with roles: UPGRADER_ROLE, PAUSER_ROLE, TEE_MANAGER_ROLE, DRB_ROLE
- **Storage Gap**: All upgradeable contracts reserve `uint256[40] __gap`
- **ReentrancyGuard**: On all state-changing external functions
- **Pausable**: Emergency pause functionality on all core contracts

---

## DEPLOYED ADDRESSES (Optimism Sepolia)

| Contract | Address |
|----------|---------|
| TALIdentityRegistry | `0x3f89CD27fD877827E7665A9883b3c0180E22A525` |
| TALReputationRegistry | `0x0052258E517835081c94c0B685409f2EfC4D502b` |
| TALValidationRegistry | `0x09447147C6E75a60A449f38532F06E19F5F632F3` |
| StakingIntegrationModule | `0x41FF86643f6d550725177af1ABBF4db9715A74b8` |

---

## SDK

**Package**: TypeScript SDK using viem, tsup, vitest
**Main entry**: `sdk/src/TALClient.ts` (471 lines) - Facade wrapping domain clients
**Tests**: 35 passing (vitest)

### Key Components

| Component | File | Status |
|-----------|------|--------|
| TALClient | `sdk/src/TALClient.ts` | COMPLETE - main facade |
| IdentityClient | `sdk/src/identity/IdentityClient.ts` | COMPLETE |
| RegistrationBuilder | `sdk/src/identity/RegistrationBuilder.ts` | COMPLETE - fluent builder |
| ReputationClient | `sdk/src/reputation/ReputationClient.ts` | COMPLETE |
| ValidationClient | `sdk/src/validation/ValidationClient.ts` | COMPLETE |
| ProofGenerator | `sdk/src/zk/ProofGenerator.ts` | STUBBED - awaiting Sprint 3 ZK circuits |
| SubgraphClient | `sdk/src/subgraph/SubgraphClient.ts` | STUBBED - awaiting subgraph deployment |
| Types | `sdk/src/types/index.ts` | COMPLETE - 329 lines |

### Key Types

- `AgentRegistrationFile` - ERC-8004 registration file structure (supports A2A, MCP, OASF, ENS, DID services)
- `AgentDetails` - Full agent info with reputation and validation stats
- `ValidationModel` enum: ReputationOnly(0), StakeSecured(1), TEEAttested(2), Hybrid(3)
- `ValidationStatus` enum: Pending(0), Completed(1), Expired(2), Disputed(3)
- `TALClientConfig` - SDK configuration

---

## FRONTEND

**Framework**: Next.js 14, React 18, Tailwind CSS, wagmi, RainbowKit
**Pages**: 8 routes

| Page | Route | Purpose | Status |
|------|-------|---------|--------|
| Landing | `/` | Hero, features, stats | COMPLETE (stats placeholder) |
| Agent Discovery | `/agents` | Search/list agents | COMPLETE |
| Agent Detail | `/agents/[id]` | Individual agent view | COMPLETE |
| Registration | `/agents/register` | Register new agent | COMPLETE |
| Reputation | `/reputation/[agentId]` | Reputation dashboard | COMPLETE |
| Validation Registry | `/validation` | List validations | COMPLETE |
| Validation Detail | `/validation/[hash]` | Individual validation | COMPLETE |
| Staking | `/staking` | Staking interface | COMPLETE |

**Key Config**: `frontend/src/lib/contracts.ts` - contract addresses
**Hooks**: `frontend/src/hooks/` - useAgent.ts, useReputation.ts, useValidation.ts (wagmi)

---

## TEST SUITE

| Test File | Type | Tests | Status |
|-----------|------|-------|--------|
| TALIdentityRegistry.t.sol | Unit | 87 | PASSING |
| TALReputationRegistry.t.sol | Unit | 59 | PASSING |
| ReputationMath.t.sol | Unit | 57 | PASSING |
| DRBIntegrationModule.t.sol | Unit | 27 | PASSING |
| StakingIntegrationModule.t.sol | Unit | 28 | PASSING |
| CrossLayerBridge.t.sol | Integration | 48 | PASSING |
| StakeSecuredValidation.t.sol | Integration | 12 | PASSING |
| TEEAttestedValidation.t.sol | Integration | 20 | PASSING |
| GasBenchmarks.t.sol | Benchmark | 11 | PASSING |
| SDK tests (4 files) | Unit | 35 | PASSING |
| **TOTAL** | | **384** | **ALL PASSING** |

### Running Tests

```bash
# Smart contracts (from contracts/ directory)
forge test

# SDK (from sdk/ directory)
npm test
# or: npx vitest run
```

---

## BUILD COMMANDS

```bash
# Contracts
cd contracts && forge build
cd contracts && forge test
cd contracts && forge test --gas-report

# SDK
cd sdk && npm install && npm run build
cd sdk && npm test

# Frontend
cd frontend && npm install && npm run dev    # Development
cd frontend && npm run build                  # Production build
```

---

## ARCHITECTURE NOTES

### Data Flow Patterns

1. **Agent Registration**: Owner -> SDK RegistrationBuilder -> IPFS -> TALIdentityRegistry.register(ipfsURI) -> ERC-721 NFT minted
2. **Reputation Flow**: Client -> TALReputationRegistry.submitFeedback() -> On-chain storage -> Stake-weighted aggregation via ReputationMath
3. **Validation Flow (StakeSecured)**: Requester -> TALValidationRegistry.requestValidation() with bounty -> DRBIntegrationModule.selectValidator() via Commit-Reveal2 -> Validator re-executes -> submitValidation(score, proof) -> Bounty distribution: 10% treasury, 9% agent, 81% validator
4. **Cross-Layer Bridge**: L1: TALStakingBridgeL1 queries Staking V3 -> relays to L2 via CrossDomainMessenger -> L2: TALStakingBridgeL2 caches stake data

### Trust Tiers (4 levels)

1. **ReputationOnly** - Lightweight, aggregated feedback scores
2. **StakeSecured** - DRB-selected validator re-execution with stake collateral
3. **TEEAttested** - Hardware-backed execution verification (SGX, Nitro, TrustZone)
4. **Hybrid** - Combines stake + TEE for maximum security

### Contract Dependencies

- TALValidationRegistry -> TALIdentityRegistry (agent verification)
- TALValidationRegistry -> TALReputationRegistry (reputation updates)
- TALValidationRegistry -> DRBIntegrationModule (validator selection)
- TALValidationRegistry -> TALStakingBridgeL2 (stake verification)
- StakingIntegrationModule -> TALStakingBridgeL2 (stake queries)
- TALIdentityRegistry -> TALStakingBridgeL2 (operator verification)
- TALReputationRegistry -> TALStakingBridgeL2 (stake-weighted calculations)

### Gas Benchmarks

- register(): ~143k gas
- submitFeedback(): ~318k gas
- requestValidation(): ~277k gas
(All within target thresholds)

---

## CURRENT STATUS

### What's Complete

- All smart contracts (8 contracts + 2 libraries + 14 interfaces)
- Cross-layer bridge (L1 <-> L2)
- SDK core (TALClient facade + domain clients)
- Frontend structure (8 pages + hooks + components)
- Deployment to Optimism Sepolia
- Comprehensive test suite (384 tests)
- Documentation (README, Technical Spec, Proposal)

### What's Incomplete / Stubbed

- **ZK Circuits** (Sprint 3 deferred) - ProofGenerator returns stubs
- **Subgraph** - SubgraphClient is stubbed, not deployed
- **Frontend Live Data** - Stats show placeholders ("-"), not connected to on-chain data
- **Governance Contracts** - TALGovernor/TALTimelock mentioned in spec but not implemented
- **Agent Runtime** - NO actual AI agents exist; system registers/validates agents but no agent execution layer
- **Task Protocol** - No specification for how tasks are submitted to agents
- **Agent Invocation** - SDK can search agents but cannot invoke them

### Critical Gap

The system is a complete REGISTRY LAYER but has no AGENT EXECUTION LAYER. The contracts register, track reputation, and validate agents, but no actual AI agents exist to use this infrastructure. The MVP must bridge this gap.

---

## DEVELOPMENT CONVENTIONS

- **Solidity**: 0.8.24, Foundry, OpenZeppelin Upgradeable, via_ir compilation, cancun EVM version
- **TypeScript**: viem for blockchain interactions, tsup for bundling, vitest for testing
- **Frontend**: Next.js 14 App Router, Tailwind CSS, wagmi v2, RainbowKit
- **Testing**: Forge for Solidity (unit + integration + gas benchmarks), Vitest for SDK
- **Deployment**: Foundry scripts, Optimism Sepolia testnet

---

## KEY FILES TO EDIT

When making changes, these are the most commonly modified files:

- **New contract features**: `contracts/src/core/*.sol` + corresponding test in `contracts/test/`
- **SDK changes**: `sdk/src/TALClient.ts` (facade), domain clients in `sdk/src/{identity,reputation,validation}/`
- **New types**: `sdk/src/types/index.ts`
- **Frontend pages**: `frontend/src/app/*/page.tsx`
- **Contract hooks**: `frontend/src/hooks/use*.ts`
- **Contract addresses**: `frontend/src/lib/contracts.ts` AND `sdk/src/types/index.ts`
