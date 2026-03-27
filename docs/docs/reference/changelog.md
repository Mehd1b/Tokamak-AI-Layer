---
title: Changelog
sidebar_position: 3
---

# Changelog

This document tracks significant changes to the Execution Kernel protocol and implementation.

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added
- **Agent Deprecation** — `AgentRegistry` now supports `deprecate()`, `undeprecate()`, and `setSuccessor()` for clean agent version migration
- **Bond Batch Locking** — `WSTONBondManager.lockBondBatch()` reduces L1 gas costs ~80% for multi-execution operators
- **Bond Query Views** — `getBondInfo()` and `getOperatorBondCount()` for transparent bond status inspection
- **Performance Dashboard** — Frontend component showing total return, 7d/30d returns, max drawdown, win rate, and Sharpe ratio
- **Strategy Status Banner** — Frontend warning when vault is in active strategy mode (deposits paused)
- **Bond Transparency Card** — Frontend component showing slash distribution, bond expiry, and relayer status
- **Deprecation Banner** — Frontend warning on deprecated agent vaults with successor link
- Bond Manager documentation page
- Glossary entries for Agent Deprecation, OptimisticKernelVault, WSTONBondManager
- Initial Docusaurus documentation site
- Comprehensive SDK documentation
- Agent Pack specification
- On-chain integration guides

### Changed
- Documentation structure reorganized into categories
- `AgentRegistry` storage gap reduced from 46 to 44 slots (2 new state mappings)

### Fixed
- N/A

---

## Sprint 3 — Marketplace & Discovery

### Added
- **Agent Marketplace** — Public directory of registered agents at `/marketplace` with search, filter, and one-click deploy
- **Leaderboard** — Agent performance rankings at `/leaderboard` with total return, Sharpe ratio, max drawdown, and win rate
- **Referral System** — Wallet-linked referral codes and rewards dashboard at `/referrals`
- **One-Click Deploy** — Deploy vaults from the UI at `/deploy` without touching the CLI
- **Metadata URI** — `AgentRegistry.setMetadataURI()` and `tal metadata set` for on-chain agent metadata (name, description, tags)
- **Performance & Management Fees** — Configurable fee structure for vault authors (performance fee on profits, management fee on AUM)
- Glossary entries for marketplace, leaderboard, referral, metadata URI, performance fee, management fee

### Changed
- Frontend rebranded to Tokagent across all metadata and UI
- Mobile header improved following Defiesta pattern
- Network dropdown made scrollable on mobile

---

## Sprint 2 — Notification & Monitoring

### Added
- **Notification Service** — Telegram bot for vault event alerts (deposits, withdrawals, executions, slashes)
- **Oracle Service** — Dockerized price oracle for agent input feeds
- **`tal` SDK** — TypeScript SDK package for programmatic interaction with Tokagent contracts
- SEO improvements: dynamic metadata, sitemap, OpenGraph images, custom 404 page

---

## Sprint 1 — Frontend & Staking

### Added
- **Frontend Application** — Next.js app with vault dashboard, portfolio view, staking, and agent pages
- **Staking UI** — WSTON staking interface at `/staking`
- **Agent Pages** — Per-agent detail pages at `/agents/[id]`
- **Vault Pages** — Per-vault detail pages at `/vaults/[address]`
- **Settings Page** — User preferences at `/settings`
- **Whitepaper Page** — Embedded whitepaper at `/whitepaper`

---

## [0.1.0] - Initial Release

### Protocol Version 1

Initial release of the Execution Kernel with:

#### Core Features
- Deterministic kernel execution in RISC Zero zkVM
- Agent-agnostic design via `AgentEntrypoint` trait
- Canonical binary codec for all protocol types
- SHA-256 commitments for inputs and outputs

#### Constraint System
- Position size limits (`max_position_notional`)
- Leverage limits (`max_leverage_bps`)
- Drawdown limits (`max_drawdown_bps`)
- Cooldown enforcement (`cooldown_seconds`)
- Asset whitelisting (`allowed_asset_id`)

#### Action Types
- Echo (0x01) - Test action
- OpenPosition (0x02) - Open trading position
- ClosePosition (0x03) - Close position
- AdjustPosition (0x04) - Modify position
- Swap (0x05) - Asset exchange

#### SDK
- `kernel-sdk` crate with agent helpers
- Action constructors
- Math utilities (checked arithmetic, basis points)
- Byte reading/writing helpers
- Prelude for common imports

#### Tooling
- Agent Pack CLI (`agent-pack`)
- Manifest format and verification
- Reproducible build support

#### Contracts (Sepolia)
- KernelExecutionVerifier
- KernelVault
- KernelOutputParser library
- MockYieldSource for testing

#### Example Agent
- `example-yield-agent` demonstrating deposit/withdraw pattern

---

## Version Compatibility

| Protocol | Kernel | SDK | Status |
|----------|--------|-----|--------|
| 1 | 1 | 0.1.x | Current |

## Upgrade Policy

### Major Versions
Breaking changes to:
- Binary encoding format
- Execution semantics
- Constraint behavior

Require new imageId registration on-chain.

### Minor Versions
Non-breaking additions:
- New optional fields
- New action types (with backward-compatible encoding)
- New SDK helpers

May be compatible with existing imageIds.

### Patch Versions
Bug fixes and documentation updates. No protocol changes.

---

## Deprecation Notices

- `AgentInfo._deprecated` field (formerly `metadataURI`) — retained for storage layout compatibility only. Use `isDeprecated()` / `getSuccessor()` for agent lifecycle management.

---

## Migration Guides

### From Pre-1.0 to 1.0

N/A - Initial release.

---

## Related

- [Versioning](/kernel/versioning) - Version handling details
- [Repository Map](/reference/repo-map) - Crate structure
