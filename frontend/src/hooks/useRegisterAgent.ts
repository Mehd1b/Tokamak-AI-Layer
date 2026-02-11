'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSignTypedData, usePublicClient, useAccount } from 'wagmi';
import { CONTRACTS, CHAIN_ID } from '@/lib/contracts';
import { TALIdentityRegistryABI } from '../../../sdk/src/abi/TALIdentityRegistry';
import { TALIdentityRegistryV2ABI } from '../../../sdk/src/abi/TALIdentityRegistryV2';

// Parse agent ID from Transfer event in receipt logs
function parseAgentIdFromReceipt(receipt: { logs: Array<{ address: string; topics: string[] }> } | undefined): bigint | undefined {
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  if (!receipt?.logs) return undefined;
  const transferLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === CONTRACTS.identityRegistry.toLowerCase() &&
      log.topics[0] === TRANSFER_TOPIC,
  );
  if (transferLog?.topics[3]) {
    return BigInt(transferLog.topics[3]);
  }
  return undefined;
}

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

  const newAgentId = parseAgentIdFromReceipt(receipt);

  return { register, hash, isPending, isConfirming, isSuccess, error, newAgentId };
}

// EIP-712 domain for TALIdentityRegistryV2
const OPERATOR_CONSENT_DOMAIN = {
  name: 'TAL Identity Registry',
  version: '2',
  chainId: BigInt(CHAIN_ID),
  verifyingContract: CONTRACTS.identityRegistry,
} as const;

const OPERATOR_CONSENT_TYPES = {
  OperatorConsent: [
    { name: 'operator', type: 'address' },
    { name: 'agentOwner', type: 'address' },
    { name: 'agentURI', type: 'string' },
    { name: 'validationModel', type: 'uint8' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export function useRegisterAgentV2() {
  const { writeContractAsync, data: hash, isPending, error: writeError } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { signTypedDataAsync } = useSignTypedData();
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Register agent with V2 contract.
   * @param agentURI IPFS URI for the agent metadata
   * @param validationModel 0=ReputationOnly, 1=StakeSecured, 2=Hybrid
   * @param selfAsOperator Whether the connected wallet should sign as operator
   */
  const registerV2 = async (
    agentURI: string,
    validationModel: number,
    selfAsOperator: boolean,
  ) => {
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let operatorConsents: any[] = [];
    let operatorSignatures: `0x${string}`[] = [];

    if (selfAsOperator && address && publicClient) {
      try {
        setIsSigning(true);

        // Read operator nonce from contract
        const nonce = await publicClient.readContract({
          address: CONTRACTS.identityRegistry,
          abi: TALIdentityRegistryV2ABI,
          functionName: 'operatorNonces',
          args: [address],
        }) as bigint;

        // 1 hour deadline
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Sign EIP-712 operator consent
        const signature = await signTypedDataAsync({
          domain: OPERATOR_CONSENT_DOMAIN,
          types: OPERATOR_CONSENT_TYPES,
          primaryType: 'OperatorConsent',
          message: {
            operator: address,
            agentOwner: address,
            agentURI,
            validationModel,
            nonce,
            deadline,
          },
        });

        operatorConsents = [{
          operator: address,
          agentOwner: address,
          agentURI,
          validationModel,
          nonce,
          deadline,
        }];
        operatorSignatures = [signature];
      } catch (err) {
        setIsSigning(false);
        const e = err instanceof Error ? err : new Error('Consent signing failed');
        setError(e);
        throw e;
      } finally {
        setIsSigning(false);
      }
    }

    // Call registerV2 on the contract
    await writeContractAsync({
      address: CONTRACTS.identityRegistry,
      abi: TALIdentityRegistryV2ABI,
      functionName: 'registerV2',
      args: [agentURI, validationModel, operatorConsents, operatorSignatures],
      chainId: CHAIN_ID,
    });
  };

  const newAgentId = parseAgentIdFromReceipt(receipt);

  return {
    registerV2,
    hash,
    isPending: isPending || isSigning,
    isSigning,
    isConfirming,
    isSuccess,
    error: error || writeError,
    newAgentId,
  };
}
