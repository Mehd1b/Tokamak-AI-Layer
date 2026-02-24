'use client';

import { useState, useEffect } from 'react';
import { formatUnits, parseEther, parseUnits } from 'viem';
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useDepositETH, useDepositERC20 } from '@/hooks/useKernelVault';
import { useNetwork } from '@/lib/NetworkContext';
import { parseVaultError } from '@/lib/vaultErrors';

const ERC20_ABI = [
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
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

  // Fetch user balance — native for ETH vaults, ERC-20 balanceOf otherwise
  const { data: nativeBalance } = useBalance({
    address: userAddress,
    chainId: selectedChainId,
    query: { enabled: isEthVault && !!userAddress },
  });
  const { data: rawTokenBalance } = useReadContract({
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    chainId: selectedChainId,
    query: { enabled: !isEthVault && !!assetAddress && !!userAddress },
  });

  const userBalance = isEthVault
    ? (nativeBalance ? formatUnits(nativeBalance.value, assetDecimals) : undefined)
    : (typeof rawTokenBalance === 'bigint' ? formatUnits(rawTokenBalance, assetDecimals) : undefined);

  // Parse the entered amount safely
  let parsedAmount = BigInt(0);
  try {
    if (amount && parseFloat(amount) > 0) {
      parsedAmount = isEthVault ? parseEther(amount) : parseUnits(amount, assetDecimals);
    }
  } catch {}

  // Check ERC-20 allowance (only for non-ETH vaults)
  const { data: rawAllowance, isLoading: isAllowanceLoading, refetch: refetchAllowance } = useReadContract({
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, vaultAddress] : undefined,
    chainId: selectedChainId,
    query: { enabled: !isEthVault && !!assetAddress && !!userAddress },
  });

  const allowance = typeof rawAllowance === 'bigint' ? rawAllowance : BigInt(0);
  const hasSufficientAllowance = !isAllowanceLoading && parsedAmount > BigInt(0) && allowance >= parsedAmount;

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

  const hasValidAmount = !!amount && parseFloat(amount) > 0;

  const handleApprove = () => {
    if (!assetAddress || !hasValidAmount) return;
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
    if (!hasValidAmount) return;
    // Guard: never submit ERC-20 deposit without sufficient allowance
    if (!isEthVault && !hasSufficientAllowance) return;
    if (isEthVault) {
      ethDeposit.deposit(amount);
    } else {
      erc20Deposit.deposit(parsedAmount);
    }
  };

  const balanceLabel = userBalance !== undefined
    ? `Balance: ${Number(userBalance).toFixed(6)} ${assetSymbol}`
    : null;

  const handleMax = () => {
    if (userBalance !== undefined) setAmount(userBalance);
  };

  // --- ETH vault: single Deposit button ---
  if (isEthVault) {
    return (
      <form onSubmit={handleDeposit} className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-gray-400" style={{ fontFamily: 'var(--font-mono), monospace' }}>
              {assetSymbol} Amount
            </label>
            {balanceLabel && (
              <button type="button" onClick={handleMax} className="text-xs text-[#A855F7] hover:underline font-mono">
                {balanceLabel}
              </button>
            )}
          </div>
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
        <button
          type="submit"
          disabled={!hasValidAmount || isPending || isConfirming}
          className="btn-primary w-full"
        >
          {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : `Deposit ${assetSymbol}`}
        </button>
        {isSuccess && <p className="text-emerald-400 text-sm font-mono">Deposit successful!</p>}
        {error && <p className="text-red-400 text-sm font-mono">{parseVaultError(error)}</p>}
      </form>
    );
  }

  // --- ERC-20 vault: two-step Approve → Deposit ---
  return (
    <form onSubmit={handleDeposit} className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm text-gray-400" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            {assetSymbol} Amount
          </label>
          {balanceLabel && (
            <button type="button" onClick={handleMax} className="text-xs text-[#A855F7] hover:underline font-mono">
              {balanceLabel}
            </button>
          )}
        </div>
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

      <div className="space-y-2">
        {/* Step 1: Approve */}
        <button
          type="button"
          onClick={handleApprove}
          disabled={!hasValidAmount || hasSufficientAllowance || isApprovePending || isApproveConfirming}
          className="btn-secondary w-full"
        >
          {isApprovePending
            ? 'Signing approval...'
            : isApproveConfirming
              ? 'Approving...'
              : hasSufficientAllowance
                ? `${assetSymbol} Approved`
                : `1. Approve ${assetSymbol}`}
        </button>

        {/* Step 2: Deposit (disabled until allowance is sufficient) */}
        <button
          type="submit"
          disabled={!hasValidAmount || !hasSufficientAllowance || isPending || isConfirming}
          className="btn-primary w-full"
        >
          {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : `2. Deposit ${assetSymbol}`}
        </button>
      </div>

      {approveError && (
        <p className="text-red-400 text-sm font-mono">{parseVaultError(approveError)}</p>
      )}
      {isSuccess && (
        <p className="text-emerald-400 text-sm font-mono">Deposit successful!</p>
      )}
      {error && (
        <p className="text-red-400 text-sm font-mono">{parseVaultError(error)}</p>
      )}
    </form>
  );
}
