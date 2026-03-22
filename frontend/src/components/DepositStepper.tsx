'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useDeposit, type DepositStep } from '@ek-sdk/react';

interface DepositStepperProps {
  vaultAddress: `0x${string}`;
  asset: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  userBalance: bigint;
  onSuccess?: (sharesMinted: bigint) => void;
}

const STEP_LABELS: Record<DepositStep, string> = {
  idle: 'Enter amount',
  checking: 'Checking...',
  approving: 'Approving token...',
  depositing: 'Depositing...',
  success: 'Complete!',
  error: 'Failed',
};

export function DepositStepper({
  vaultAddress,
  asset,
  assetSymbol,
  assetDecimals,
  userBalance,
  onSuccess,
}: DepositStepperProps) {
  const { isConnected } = useAccount();
  const { step, error, deposit, reset, needsApproval, isETH } = useDeposit(vaultAddress, asset);
  const [amount, setAmount] = useState('');

  const parsedAmount = (() => {
    try {
      return amount ? parseUnits(amount, assetDecimals) : 0n;
    } catch {
      return 0n;
    }
  })();

  const handleDeposit = async () => {
    if (parsedAmount <= 0n) return;
    await deposit(parsedAmount);
    onSuccess?.(parsedAmount);
  };

  const handleMax = () => {
    setAmount(formatUnits(userBalance, assetDecimals));
  };

  // Step indicator
  const steps = isETH
    ? [{ label: 'Connect', done: isConnected }, { label: 'Deposit', done: step === 'success' }]
    : [
        { label: 'Connect', done: isConnected },
        { label: `Approve ${assetSymbol}`, done: step === 'depositing' || step === 'success' || !needsApproval(parsedAmount) },
        { label: 'Deposit', done: step === 'success' },
      ];

  const currentStepIndex = steps.findIndex((s) => !s.done);
  const totalSteps = steps.length;

  const isProcessing = step === 'approving' || step === 'depositing' || step === 'checking';

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-white/50">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              s.done ? 'bg-emerald-500/20 text-emerald-400' : i === currentStepIndex ? 'bg-purple-500/20 text-purple-400 animate-pulse' : 'bg-white/5 text-white/30'
            }`}>
              {s.done ? '+' : i + 1}
            </span>
            <span className={s.done ? 'text-emerald-400' : i === currentStepIndex ? 'text-white/70' : ''}>{s.label}</span>
            {i < steps.length - 1 && <span className="text-white/20 mx-1">--</span>}
          </div>
        ))}
      </div>

      {/* Amount input */}
      <div className="relative">
        <input
          type="text"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); if (step === 'error') reset(); }}
          placeholder="0.00"
          disabled={isProcessing}
          className="input-dark w-full pr-24"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <button onClick={handleMax} disabled={isProcessing} className="text-xs text-purple-400 hover:text-purple-300">
            MAX
          </button>
          <span className="text-xs text-white/40">{assetSymbol}</span>
        </div>
      </div>

      {/* Balance */}
      <p className="text-xs text-white/40">
        Balance: {formatUnits(userBalance, assetDecimals)} {assetSymbol}
      </p>

      {/* Help text */}
      {!isETH && needsApproval(parsedAmount) && step === 'idle' && parsedAmount > 0n && (
        <p className="text-xs text-white/50">
          You need to approve the vault to spend your {assetSymbol} before depositing. This is a one-time transaction.
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
          {error.message}
        </div>
      )}

      {/* Action button */}
      {!isConnected ? (
        <p className="text-sm text-white/50 text-center">Connect your wallet to deposit</p>
      ) : (
        <button
          onClick={handleDeposit}
          disabled={isProcessing || parsedAmount <= 0n || parsedAmount > userBalance}
          className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {STEP_LABELS[step]}
              {!isETH && ` (Step ${currentStepIndex + 1} of ${totalSteps})`}
            </span>
          ) : step === 'error' ? (
            'Try Again'
          ) : !isETH && needsApproval(parsedAmount) ? (
            `Approve & Deposit ${assetSymbol} (${totalSteps} steps)`
          ) : (
            `Deposit ${assetSymbol}`
          )}
        </button>
      )}
    </div>
  );
}
