'use client';

import { useGasPrice } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';

// HyperEVM chains do not support EIP-1559. When using a JSON-RPC wallet
// (MetaMask), viem forwards raw params without fee estimation, so the wallet
// may attempt type-2 (EIP-1559) transactions that the RPC rejects.
// By explicitly including `gasPrice` in the write-contract call, we force
// the wallet to build a legacy (type-0) transaction.

const LEGACY_CHAIN_IDS = new Set([999, 998]);

export function useLegacyGas(): { gasPrice?: bigint } {
  const { selectedChainId } = useNetwork();
  const isLegacy = LEGACY_CHAIN_IDS.has(selectedChainId);
  const { data: gasPrice } = useGasPrice({
    chainId: selectedChainId,
    query: { enabled: isLegacy },
  });
  return isLegacy && gasPrice ? { gasPrice } : {};
}
