# Tokamak AI Layer (TAL)

**Economic Security & Coordination Layer for the AI Agent Economy**

TAL is an ERC-8004 compliant infrastructure layer providing trustless AI agent discovery, reputation management, and execution verification on Tokamak L2.

## Overview

TAL enables trustworthy interactions between AI agents and users by providing:

- **Identity Registry**: ERC-721 based agent identities with ZK commitments and capability verification
- **Reputation Registry**: Stake-weighted feedback aggregation with payment proof integration
- **Validation Registry**: Multi-model validation (Reputation, Stake-Secured, TEE-Attested, Hybrid)
- **Cross-Layer Bridge**: L1/L2 architecture for stake-secured validation with slashing conditions
- **Integration Modules**: DRB-powered validator selection and Staking V3 integration
- **TEE Attestation**: Hardware attestation verification for high-assurance validation

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Ethereum L1                                 │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│  TALStakingBridgeL1 │   Staking V3        │  TALSlashingConditionsL1│
│  • Query stakes     │   (Tokamak Native)  │  • Execute slashing     │
│  • Relay to L2      │                     │  • Evidence validation  │
└─────────┬───────────┴─────────────────────┴────────────┬────────────┘
          │              Cross-Domain Messenger           │
          ▼                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Tokamak L2                                  │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│   Identity      │   Reputation    │        Validation               │
│   Registry      │   Registry      │        Registry                 │
├─────────────────┼─────────────────┼─────────────────────────────────┤
│ • ERC-721 NFTs  │ • Feedback      │ • ReputationOnly                │
│ • ZK Identity   │ • Stake-Weight  │ • StakeSecured (DRB)            │
│ • Capabilities  │ • Merkle Trees  │ • TEEAttested                   │
│ • Operators     │ • Payment Proof │ • Hybrid                        │
└─────────────────┴─────────────────┴─────────────────────────────────┘
          │                   │                     │
    ┌─────┴─────┐       ┌─────┴─────┐         ┌─────┴─────┐
    │  Staking  │       │    DRB    │         │    TEE    │
    │ Bridge L2 │       │  Module   │         │  Providers│
    │ • Manage  │       │ • Commit- │         │ • SGX     │
    │   tiers   │       │   Reveal² │         │ • Nitro   │
    │ • Seignio │       │ • Fair    │         │ • TrustZone
    │   -rage   │       │   select. │         │           │
    └───────────┘       └───────────┘         └───────────┘
```

## Key Features

### Trust Tiers
| Tier | Model | Use Case | Cost |
|------|-------|----------|------|
| 1 | Reputation Only | Low-value queries | Free |
| 2 | Stake-Secured | Medium-value tasks | Bounty + Stake |
| 3 | TEE Attested | High-value operations | TEE fees |
| 4 | Hybrid | Critical operations | Combined |

### Differentiators
- **DRB-Powered Fairness**: Commit-Reveal² for manipulation-resistant validator selection
- **Economic Security**: TON staking with slashing for misbehavior
- **TEE Integration**: Hardware attestation via Intel SGX, AWS Nitro, ARM TrustZone
- **Privacy-Preserving Identity**: ZK commitments for selective capability disclosure

## Quick Start

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 18+

### Installation

```bash
cd contracts
forge install
```

### Build

```bash
forge build
```

### Test

```bash
forge test
```

Run specific test suites:

```bash
# Unit tests
forge test --match-path "*/test/unit/*"

# Integration tests
forge test --match-path "*/test/integration/*"

# Gas benchmarks
forge test --match-contract "GasBenchmarks"
```

### Deploy (Local)

```bash
# Start local node
anvil

# Deploy
forge script script/DeployLocal.s.sol --broadcast --rpc-url http://localhost:8545
```

## Contract Addresses

### Optimism Sepolia (Live)
| Contract | Address |
|----------|---------|
| TALIdentityRegistry | `0x3f89CD27fD877827E7665A9883b3c0180E22A525` |
| TALReputationRegistry | `0x0052258E517835081c94c0B685409f2EfC4D502b` |
| TALValidationRegistry | `0x09447147C6E75a60A449f38532F06E19F5F632F3` |
| StakingIntegrationModule | `0x41FF86643f6d550725177af1ABBF4db9715A74b8` |

## Test Suite

**381 tests total - All passing**

### Test Coverage by Suite

| Suite | Tests | Status |
|-------|-------|--------|
| TALIdentityRegistry | 87 | ✓ |
| TALReputationRegistry | 59 | ✓ |
| ReputationMath | 57 | ✓ |
| CrossLayerBridge | 48 | ✓ |
| DRBIntegrationModule | 24 | ✓ |
| StakingIntegrationModule | 28 | ✓ |
| TEEAttestedValidation | 20 | ✓ |
| StakeSecuredValidation | 12 | ✓ |
| GasBenchmarks | 11 | ✓ |
| **SDK** | | |
| types.test.ts | 5 | ✓ |
| RegistrationBuilder.test.ts | 13 | ✓ |
| ProofGenerator.test.ts | 11 | ✓ |
| SubgraphClient.test.ts | 6 | ✓ |

### Test Categories

- **Unit Tests**: Core registry functionality, math libraries, individual module behavior
- **Integration Tests**: Cross-layer bridge communication, stake-secured validation flow, TEE attestation verification
- **Mocks**: Cross-domain messaging, DRB simulation, Staking V3 integration, TEE provider behavior

## Gas Benchmarks

| Function | Gas Used | Target |
|----------|----------|--------|
| `register()` | ~143k | 200k |
| `submitFeedback()` | ~318k | 350k |
| `requestValidation()` | ~277k | 300k |

## SDK

TypeScript SDK for interacting with TAL smart contracts. See [`sdk/README.md`](sdk/README.md) for full documentation.

```bash
cd sdk
npm install
npm test        # 35 tests, all passing
npm run build
```

**Key features:**
- `TALClient` facade wrapping Identity, Reputation, and Validation clients
- `RegistrationBuilder` for ERC-8004 compliant agent registration files with IPFS upload
- `ProofGenerator` interface for ZK proofs (Sprint 3)
- `SubgraphClient` for indexed data queries (gracefully stubbed)
- Full TypeScript types for all contract interactions

```typescript
import { TALClient, RegistrationBuilder } from '@tokamak/tal-sdk';

const client = new TALClient({ rpcUrl: 'https://sepolia.optimism.io' });
const agent = await client.getAgent(1n);
```

## Frontend

Next.js 14 web interface for the TAL protocol. See [`frontend/README.md`](frontend/README.md) for full documentation.

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev     # http://localhost:3000
npm run build   # 8 routes, all passing
```

**Pages:** Landing, Agent Discovery, Agent Detail, Agent Registration, Reputation Dashboard, Validation Registry, Validation Detail, Staking

**Stack:** Next.js 14 (App Router), Tailwind CSS, wagmi + viem, RainbowKit, TanStack React Query

## Project Structure

```
Tokamak-AI-Layer/
├── contracts/
│   ├── src/
│   │   ├── core/
│   │   │   ├── TALIdentityRegistry.sol
│   │   │   ├── TALReputationRegistry.sol
│   │   │   └── TALValidationRegistry.sol
│   │   ├── bridge/
│   │   │   ├── TALSlashingConditionsL1.sol
│   │   │   ├── TALStakingBridgeL1.sol
│   │   │   └── TALStakingBridgeL2.sol
│   │   ├── modules/
│   │   │   ├── DRBIntegrationModule.sol
│   │   │   └── StakingIntegrationModule.sol
│   │   ├── interfaces/
│   │   │   ├── IERC8004IdentityRegistry.sol
│   │   │   ├── IERC8004ReputationRegistry.sol
│   │   │   ├── IERC8004ValidationRegistry.sol
│   │   │   ├── ITALIdentityRegistry.sol
│   │   │   ├── ITALReputationRegistry.sol
│   │   │   ├── ITALValidationRegistry.sol
│   │   │   ├── ITALStakingBridgeL1.sol
│   │   │   ├── ITALStakingBridgeL2.sol
│   │   │   ├── ITALSlashingConditionsL1.sol
│   │   │   ├── IDRB.sol
│   │   │   ├── IDRBIntegrationModule.sol
│   │   │   ├── IStakingIntegrationModule.sol
│   │   │   ├── IStakingV3.sol
│   │   │   └── ITEEAttestation.sol
│   │   └── libraries/
│   │       ├── ReputationMath.sol
│   │       └── SlashingCalculator.sol
│   ├── test/
│   │   ├── unit/
│   │   │   ├── TALIdentityRegistry.t.sol
│   │   │   ├── TALReputationRegistry.t.sol
│   │   │   ├── ReputationMath.t.sol
│   │   │   ├── DRBIntegrationModule.t.sol
│   │   │   └── StakingIntegrationModule.t.sol
│   │   ├── integration/
│   │   │   ├── CrossLayerBridge.t.sol
│   │   │   ├── StakeSecuredValidation.t.sol
│   │   │   └── TEEAttestedValidation.t.sol
│   │   ├── mocks/
│   │   │   ├── MockCrossDomainMessenger.sol
│   │   │   ├── MockDRB.sol
│   │   │   ├── MockDepositManagerV3.sol
│   │   │   ├── MockStakingV3.sol
│   │   │   └── MockTEEProvider.sol
│   │   └── GasBenchmarks.t.sol
│   └── script/
│       ├── DeployLocal.s.sol
│       └── DeploySepolia.s.sol
├── sdk/
│   ├── src/
│   │   ├── TALClient.ts              # Main facade client
│   │   ├── identity/                  # Agent identity operations
│   │   ├── reputation/                # Feedback & reputation
│   │   ├── validation/                # Validation request/submit
│   │   ├── zk/                        # ZK proof interface (Sprint 3)
│   │   ├── subgraph/                  # GraphQL subgraph client
│   │   ├── abi/                       # Contract ABIs
│   │   ├── types/                     # TypeScript types & constants
│   │   └── __tests__/                 # 35 unit tests
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/                       # Next.js App Router (8 pages)
│   │   ├── components/                # Reusable UI components
│   │   ├── hooks/                     # wagmi contract hooks
│   │   └── lib/                       # Utils & contract config
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   └── TECHNICAL_SPECIFICATION.md
├── PROPOSAL.md
└── DECK_PITCH.md
```

## Sprint 2: Cross-Layer Bridge & Integration

### New Components

**TALStakingBridgeL1** - Ethereum L1 stake relay contract
- Queries Staking V3 for operator stake amounts
- Relays stake data to L2 via cross-domain messaging
- Manages operator stake thresholds for validation participation

**TALStakingBridgeL2** - Tokamak L2 stake management contract
- Receives stake updates from L1 bridge
- Manages operator tier assignments based on stake amounts
- Distributes seigniorage rewards to qualified operators
- Tracks historical stake levels for validation disputes

**TALSlashingConditionsL1** - Ethereum L1 slashing execution contract
- Executes slashing based on L2 validation failure evidence
- Validates evidence signatures and timestamps
- Reduces operator stakes on Staking V3
- Prevents double-slashing for same offense

### Integration Modules

**DRBIntegrationModule** - Decentralized Random Beacon integration
- Implements Commit-Reveal² protocol for manipulation-resistant validator selection
- Queries DRB for random values in validation rounds
- Selects validators proportional to stake holdings
- Prevents validator self-selection bias

**StakingIntegrationModule** - Staking V3 integration
- Verifies operator stakes during validation requests
- Executes slashing through L2-L1 bridge coordination
- Routes seigniorage rewards to staking contract
- Maintains stake-to-tier mappings

### TEE Attestation System

Complete TEE provider management for hardware-backed validation:
- **Provider Whitelisting**: Trusted TEE provider registration
- **Attestation Verification**: Intel SGX, AWS Nitro, ARM TrustZone support
- **Enclave Hash Registration**: Secure enclave code validation
- **Signature Verification**: Cryptographic proof of TEE execution

## Sprint 4: SDK + Frontend

### TypeScript SDK (`sdk/`)
- **TALClient** facade with Identity, Reputation, and Validation sub-clients
- **RegistrationBuilder** — fluent builder for ERC-8004 agent registration files with IPFS upload (Pinata/Infura)
- **ProofGenerator** — ZK proof interface (stubbed until Sprint 3 circuits)
- **SubgraphClient** — GraphQL client for indexed data (gracefully stubbed until deployment)
- **35 unit tests** covering types, registration builder, proof encoding, subgraph client

### Next.js Frontend (`frontend/`)
- **Agent Discovery** — Browse and search registered agents
- **Agent Registration** — Multi-step form with service endpoints and capabilities
- **Agent Detail** — Identity, stats, operator status, feedback count, validations
- **Reputation Dashboard** — Standard, stake-weighted, and verified reputation views
- **Validation Registry** — Trust model overview, validation list and detail with timeline
- **Staking Interface** — Stake/unstake forms with cross-layer bridge information
- **Wallet Integration** — RainbowKit + wagmi on Optimism Sepolia

## Documentation

- [Technical Specification](docs/TECHNICAL_SPECIFICATION.md)
- [SDK Documentation](sdk/README.md)
- [Frontend Documentation](frontend/README.md)
- [Proposal](PROPOSAL.md)
- [Pitch Deck](DECK_PITCH.md)

## Standards Compliance

- **ERC-8004**: Trustless Agents Standard
- **ERC-721**: NFT Standard for Agent Identities
- **ERC-165**: Interface Detection
- **EIP-712**: Typed Structured Data Signing

## Security

### Audits
- Pending

### Security Features
- UUPS upgradeable proxy pattern
- Role-based access control (OpenZeppelin)
- Pausable for emergencies
- ReentrancyGuard protection
- Stake-based Sybil resistance

### Bug Bounty
Coming soon

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `forge test`
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE)

## Links

- [Tokamak Network](https://tokamak.network)
- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)

---

Built with Foundry, TypeScript, and Next.js on Tokamak L2
