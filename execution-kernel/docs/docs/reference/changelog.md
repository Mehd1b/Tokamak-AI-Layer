---
title: Changelog
sidebar_position: 3
---

# Changelog

This document tracks significant changes to the Execution Kernel protocol and implementation.

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added
- Initial Docusaurus documentation site
- Comprehensive SDK documentation
- Agent Pack specification
- On-chain integration guides

### Changed
- Documentation structure reorganized into categories

### Fixed
- N/A

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

None currently.

---

## Migration Guides

### From Pre-1.0 to 1.0

N/A - Initial release.

---

## Related

- [Versioning](/kernel/versioning) - Version handling details
- [Repository Map](/reference/repo-map) - Crate structure
