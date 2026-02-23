'use client';

import { useState, useEffect } from 'react';
import { parseEther, parseUnits } from 'viem';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useDepositETH, useDepositERC20 } from '@/hooks/useKernelVault';
import { useNetwork } from '@/lib/NetworkContext';

const ERC20_ABI = [
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

interface VaultDepositFormProps {
  vaultAddress: `0x${string}`;
  isEthVault?: boolean;
  assetDecimals?: number;
  assetSymbol?: string;
  assetAddress?: `0x${string}`;
}

export function VaultDepositForm({ vaultAddress, isEthVault = true, assetDecimals = 18, assetSymbol = 'ETH', assetAddress }: VaultDepositFormProps) {
  const [amount, setAmount] = useState('');
  const { address: userAddress } = useAccount();
  const { selectedChainId } = useNetwork();

  const ethDeposit = useDepositETH(vaultAddress);
  const erc20Deposit = useDepositERC20(vaultAddress);

  // Parse the entered amount safely
  let parsedAmount = BigInt(0);
  try {
    if (amount && parseFloat(amount) > 0) {
      parsedAmount = isEthVault ? parseEther(amount) : parseUnits(amount, assetDecimals);
    }
  } catch {}

  // Check ERC-20 allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, vaultAddress] : undefined,
    chainId: selectedChainId,
    query: { enabled: !isEthVault && !!assetAddress && !!userAddress },
  });

  const needsApproval = !isEthVault && parsedAmount > BigInt(0) && (allowance === undefined || (allowance as bigint) < parsedAmount);

  // Approve transaction
  const { data: approveHash, writeContract: writeApprove, isPending: isApprovePending, error: approveError } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash, chainId: selectedChainId });

  // Refetch allowance after approval confirms
  useEffect(() => {
    if (isApproveSuccess) {
      refetchAllowance();
    }
  }, [isApproveSuccess, refetchAllowance]);

  const { isPending, isConfirming, isSuccess, error } = isEthVault ? ethDeposit : erc20Deposit;

  const handleApprove = () => {
    if (!assetAddress) return;
    writeApprove({
      address: assetAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [vaultAddress, parsedAmount],
      chainId: selectedChainId,
    });
  };

  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    if (isEthVault) {
      ethDeposit.deposit(amount);
    } else {
      erc20Deposit.deposit(parsedAmount);
    }
  };

  return (
    <form onSubmit={handleDeposit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          {assetSymbol} Amount
        </label>
        <input
          type="number"
          step="any"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.1"
          className="input-dark font-mono"
        />
      </div>

      {needsApproval ? (
        <button
          type="button"
          onClick={handleApprove}
          disabled={!amount || parseFloat(amount) <= 0 || isApprovePending || isApproveConfirming}
          className="btn-secondary w-full"
        >
          {isApprovePending ? 'Signing approval...' : isApproveConfirming ? 'Approving...' : `Approve ${assetSymbol}`}
        </button>
      ) : (
        <button
          type="submit"
          disabled={!amount || parseFloat(amount) <= 0 || isPending || isConfirming}
          className="btn-primary w-full"
        >
          {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : `Deposit ${assetSymbol}`}
        </button>
      )}

      {approveError && (
        <p className="text-red-400 text-sm font-mono">{approveError.message.slice(0, 100)}</p>
      )}
      {isApproveSuccess && !needsApproval && (
        <p className="text-emerald-400 text-sm font-mono">Approved! Now click Deposit.</p>
      )}
      {isSuccess && (
        <p className="text-emerald-400 text-sm font-mono">Deposit successful!</p>
      )}
      {error && (
        <p className="text-red-400 text-sm font-mono">{error.message.slice(0, 100)}</p>
      )}
    </form>
  );
}
