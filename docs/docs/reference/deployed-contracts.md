---
title: Deployed Contracts
sidebar_position: 2
---

# Deployed Contracts

This page lists all deployed contract addresses for the Tokamak AI Layer across both Thanos Sepolia (L2) and Ethereum Sepolia (L1).

## Thanos Sepolia L2

The core TAL protocol contracts are deployed on Thanos Sepolia, a Tokamak Network L2 testnet.

| Contract | Address | Description |
|----------|---------|-------------|
| TALIdentityRegistry | [`0x3f89CD27fD877827E7665A9883b3c0180E22A525`](https://explorer.thanos-sepolia.tokamak.network/address/0x3f89CD27fD877827E7665A9883b3c0180E22A525) | ERC-721 agent identity NFTs, ZK commitments, operator management |
| TALReputationRegistry | [`0x0052258E517835081c94c0B685409f2EfC4D502b`](https://explorer.thanos-sepolia.tokamak.network/address/0x0052258E517835081c94c0B685409f2EfC4D502b) | Stake-weighted feedback aggregation, payment proofs |
| TALValidationRegistry | [`0x09447147C6E75a60A449f38532F06E19F5F632F3`](https://explorer.thanos-sepolia.tokamak.network/address/0x09447147C6E75a60A449f38532F06E19F5F632F3) | Multi-model validation, TEE attestation, bounty distribution |
| StakingIntegrationModule | [`0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30`](https://explorer.thanos-sepolia.tokamak.network/address/0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30) | Stake queries, slashing, seigniorage routing |
| TaskFeeEscrow | [`0x6D68Cd8fD89BF1746A1948783C92A00E591d1227`](https://explorer.thanos-sepolia.tokamak.network/address/0x6D68Cd8fD89BF1746A1948783C92A00E591d1227) | Native TON task fee escrow with refund support |
| WSTON (L2 Bridged) | [`0x4d7b29213c9ad19a2aaa01e3ccf6f209636a786f`](https://explorer.thanos-sepolia.tokamak.network/address/0x4d7b29213c9ad19a2aaa01e3ccf6f209636a786f) | Bridged WrappedStakedTON (ERC-20, 27 decimals) via OptimismMintableERC20Factory |
| WSTONVault | *Pending deployment* | L2 vault for locking bridged WSTON with slashing support |

## Ethereum Sepolia L1

Tokamak Network staking infrastructure on Ethereum Sepolia, used for economic security.

| Contract | Address | Description |
|----------|---------|-------------|
| TON | [`0xa30fe40285B8f5c0457DbC3B7C8A280373c40044`](https://sepolia.etherscan.io/address/0xa30fe40285B8f5c0457DbC3B7C8A280373c40044) | Tokamak Network Token (ERC-20, 18 decimals) |
| WTON | [`0x79E0d92670106c85E9067b56B8F674340dCa0Bbd`](https://sepolia.etherscan.io/address/0x79E0d92670106c85E9067b56B8F674340dCa0Bbd) | Wrapped TON (ERC-20, 27 decimals) |
| WSTON | [`0x4e1e3e6De6F9aE2C0D8a21626082Ef70dBa87e6D`](https://sepolia.etherscan.io/address/0x4e1e3e6De6F9aE2C0D8a21626082Ef70dBa87e6D) | Wrapped Staked TON (ERC-20, transferable staking receipt) |
| DepositManager | [`0x90ffcc7F168DceDBEF1Cb6c6eB00cA73F922956F`](https://sepolia.etherscan.io/address/0x90ffcc7F168DceDBEF1Cb6c6eB00cA73F922956F) | WTON staking deposits and withdrawal requests |
| SeigManager | [`0x2320542ae933FbAdf8f5B97cA348c7CeDA90fAd7`](https://sepolia.etherscan.io/address/0x2320542ae933FbAdf8f5B97cA348c7CeDA90fAd7) | Seigniorage management and stake tracking |
| Layer2Registry | [`0xA0a9576b437E52114aDA8b0BC4149F2F5c604581`](https://sepolia.etherscan.io/address/0xA0a9576b437E52114aDA8b0BC4149F2F5c604581) | Registry of Layer2 operator contracts |
| Layer2 (Operator) | [`0xCBeF7Cc221c04AD2E68e623613cc5d33b0fE1599`](https://sepolia.etherscan.io/address/0xCBeF7Cc221c04AD2E68e623613cc5d33b0fE1599) | Registered Layer2 operator for TAL staking |

## Optimism Sepolia (Legacy)

Earlier deployments on Optimism Sepolia before migration to Thanos Sepolia. These addresses may still be referenced in older documentation.

| Contract | Address |
|----------|---------|
| TALIdentityRegistry | [`0x3f89CD27fD877827E7665A9883b3c0180E22A525`](https://sepolia-optimism.etherscan.io/address/0x3f89CD27fD877827E7665A9883b3c0180E22A525) |
| TALReputationRegistry | [`0x0052258E517835081c94c0B685409f2EfC4D502b`](https://sepolia-optimism.etherscan.io/address/0x0052258E517835081c94c0B685409f2EfC4D502b) |
| TALValidationRegistry | [`0x09447147C6E75a60A449f38532F06E19F5F632F3`](https://sepolia-optimism.etherscan.io/address/0x09447147C6E75a60A449f38532F06E19F5F632F3) |
| StakingIntegrationModule | [`0x41FF86643f6d550725177af1ABBF4db9715A74b8`](https://sepolia-optimism.etherscan.io/address/0x41FF86643f6d550725177af1ABBF4db9715A74b8) |

## Chain Configuration

| Property | Thanos Sepolia (L2) | Ethereum Sepolia (L1) |
|----------|---------------------|----------------------|
| Chain ID | `111551119090` | `11155111` |
| Native Currency | TON (18 decimals) | ETH (18 decimals) |
| RPC URL | `https://rpc.thanos-sepolia.tokamak.network` | Public Sepolia RPCs |
| Block Explorer | `https://explorer.thanos-sepolia.tokamak.network` | `https://sepolia.etherscan.io` |
| Network Type | Tokamak L2 (Optimism-based) | Ethereum Testnet |

## Source Files

The contract addresses used by the frontend are defined in:

- **Frontend config**: `frontend/src/lib/contracts.ts`
- **SDK types**: `sdk/src/types/index.ts`
- **Deployment scripts**: `contracts/script/` (Foundry deployment scripts)

:::info Testnet Deployment
All addresses listed on this page are for testnet deployments. These contracts use test tokens and operate on test networks. Do not send mainnet assets to these addresses.
:::
