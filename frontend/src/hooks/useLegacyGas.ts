'use client';

import { useGasPrice } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';

// HyperEVM chains do not support EIP-1559. When using a JSON-RPC wallet
// (MetaMask), viem forwards raw params without fee estimation, so the wallet
// may attempt type-2 (EIP-1559) transactions that the RPC rejects.
// By explicitly including `gasPrice` in the write-contract call, we force
// the wallet to build a legacy (type-0) transaction.
//
// Additionally, HyperEVM's eth_estimateGas is unreliable and often returns
// -32603 (Internal JSON-RPC error) even for valid transactions. Providing
// an explicit `gas` limit bypasses estimation entirely.

const LEGACY_CHAIN_IDS = new Set([999, 998]);

/** Safe gas limit for standard vault operations (deposit, withdraw, approve). */
const HYPER_EVM_GAS_LIMIT = BigInt(500_000);

export function useLegacyGas(): { gasPrice?: bigint; gas?: bigint } {
  const { selectedChainId } = useNetwork();
  const isLegacy = LEGACY_CHAIN_IDS.has(selectedChainId);
  const { data: gasPrice } = useGasPrice({
    chainId: selectedChainId,
    query: { enabled: isLegacy },
  });
  if (!isLegacy) return {};
  return {
    ...(gasPrice ? { gasPrice } : {}),
    gas: HYPER_EVM_GAS_LIMIT,
  };
}
