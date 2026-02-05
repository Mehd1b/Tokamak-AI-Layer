# Tokamak AI Layer (TAL)

**Economic Security & Coordination Layer for the AI Agent Economy**

TAL is an ERC-8004 compliant infrastructure layer providing trustless AI agent discovery, reputation management, and execution verification on Tokamak L2.

## Overview

TAL enables trustworthy interactions between AI agents and users by providing:

- **Identity Registry**: ERC-721 based agent identities with ZK commitments and capability verification
- **Reputation Registry**: Stake-weighted feedback aggregation with payment proof integration
- **Validation Registry**: Multi-model validation (Reputation, Stake-Secured, TEE-Attested, Hybrid)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Tokamak AI Layer                           │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Identity      │   Reputation    │        Validation           │
│   Registry      │   Registry      │        Registry             │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ • ERC-721 NFTs  │ • Feedback      │ • ReputationOnly            │
│ • ZK Identity   │ • Stake-Weight  │ • StakeSecured (DRB)        │
│ • Capabilities  │ • Merkle Trees  │ • TEEAttested               │
│ • Operators     │ • Payment Proof │ • Hybrid                    │
└─────────────────┴─────────────────┴─────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
        │  Staking  │   │    DRB    │   │    TEE    │
        │    V2     │   │Coordinator│   │  Oracle   │
        └───────────┘   └───────────┘   └───────────┘
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

### Deploy (Local)

```bash
# Start local node
anvil

# Deploy
forge script script/DeployLocal.s.sol --broadcast --rpc-url http://localhost:8545
```

## Contract Addresses

### Testnet (Coming Soon)
| Contract | Address |
|----------|---------|
| TALIdentityRegistry | TBD |
| TALReputationRegistry | TBD |
| TALValidationRegistry | TBD |

## Gas Benchmarks

| Function | Gas Used | Target |
|----------|----------|--------|
| `register()` | ~143k | 200k |
| `submitFeedback()` | ~318k | 350k |
| `requestValidation()` | ~277k | 300k |

## Project Structure

```
Tokamak-AI-Layer/
├── contracts/
│   ├── src/
│   │   ├── core/
│   │   │   ├── TALIdentityRegistry.sol
│   │   │   ├── TALReputationRegistry.sol
│   │   │   └── TALValidationRegistry.sol
│   │   ├── interfaces/
│   │   │   ├── IERC8004IdentityRegistry.sol
│   │   │   ├── IERC8004ReputationRegistry.sol
│   │   │   ├── IERC8004ValidationRegistry.sol
│   │   │   ├── ITALIdentityRegistry.sol
│   │   │   ├── ITALReputationRegistry.sol
│   │   │   └── ITALValidationRegistry.sol
│   │   └── libraries/
│   │       └── ReputationMath.sol
│   ├── test/
│   │   ├── unit/
│   │   └── GasBenchmarks.t.sol
│   └── script/
│       └── DeployLocal.s.sol
├── docs/
│   └── TECHNICAL_SPECIFICATION.md
├── PROPOSAL.md
└── DECK_PITCH.md
```

## Documentation

- [Technical Specification](docs/TECHNICAL_SPECIFICATION.md)
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

Built with Foundry on Tokamak L2
