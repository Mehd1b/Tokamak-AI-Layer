'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, CHAIN_ID } from '@/lib/contracts';
import { TALIdentityRegistryABI } from '../../../sdk/src/abi/TALIdentityRegistry';

export function useRegisterAgent() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const register = (agentURI: string) => {
    writeContract({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryABI,
      functionName: 'register',
      args: [agentURI],
      chainId: CHAIN_ID,
    });
  };

  // Parse new agent ID from ERC-721 Transfer(address,address,uint256) event
  // Transfer topic0 = keccak256("Transfer(address,address,uint256)")
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  let newAgentId: bigint | undefined;
  if (receipt?.logs) {
    const transferLog = receipt.logs.find(
      (log) =>
        log.address.toLowerCase() === CONTRACTS.identityRegistry.toLowerCase() &&
        log.topics[0] === TRANSFER_TOPIC,
    );
    if (transferLog?.topics[3]) {
      newAgentId = BigInt(transferLog.topics[3]);
    }
  }

  return { register, hash, isPending, isConfirming, isSuccess, error, newAgentId };
}
