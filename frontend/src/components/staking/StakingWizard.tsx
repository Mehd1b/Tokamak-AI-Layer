'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';
import { Loader2, AlertTriangle, Info, CheckCircle2, ArrowRight, Zap, Settings2 } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useStakingFlow, type StakingMode, type TokenSource } from '@/hooks/useStakingFlow';

interface StakingWizardProps {
  onComplete?: () => void;
}

export function StakingWizard({ onComplete }: StakingWizardProps) {
  const { address, isConnected, isL1, switchToL1 } = useWallet();
  const flow = useStakingFlow(address);
  const [showTooltip, setShowTooltip] = useState(false);

  const {
    step, mode, tokenSource, amount, balances, isLoading,
    error, result, setMode, setTokenSource, setAmount,
    execute, retry, reset, estimatedWSTON, stepLabel,
    stepNumber, totalSteps, canExecute,
  } = flow;

  const isComplete = step === 'COMPLETE';
  const isError = step === 'ERROR';
  const isIdle = step === 'IDLE';

  // Format helpers
  const formatBalance = (value: bigint | undefined, decimals = 18) => {
    if (value === undefined) return '-';
    const formatted = formatUnits(value, decimals);
    const num = parseFloat(formatted);
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };
  const formatWTON = (value: bigint | undefined) => formatBalance(value, 27);

  // Build step array for progress indicator
  const getSteps = () => {
    if (mode === 'quick') {
      return [
        { label: `Approve ${tokenSource}`, key: 'APPROVING_TOKEN' },
        { label: 'Stake via Router', key: 'EXECUTING_ROUTER' },
      ];
    }
    if (tokenSource === 'TON') {
      return [
        { label: 'Approve TON', key: 'APPROVING_TON' },
        { label: 'Swap WTON', key: 'SWAPPING_WTON' },
        { label: 'Approve WTON', key: 'APPROVING_WTON' },
        { label: 'Deposit WSTON', key: 'DEPOSITING_WSTON' },
      ];
    }
    return [
      { label: 'Approve WTON', key: 'APPROVING_WTON' },
      { label: 'Deposit WSTON', key: 'DEPOSITING_WSTON' },
    ];
  };

  const steps = getSteps();
  const activeStepIndex = steps.findIndex(s => s.key === step);

  // Determine which steps are done
  const stepOrder = steps.map(s => s.key);
  const currentIdx = stepOrder.indexOf(step);
  const isStepDone = (idx: number) => {
    if (isComplete) return true;
    if (currentIdx < 0) return false;
    return idx < currentIdx;
  };
  const isStepActive = (idx: number) => idx === currentIdx;

  const handleExecute = () => {
    execute();
  };

  const handleComplete = () => {
    onComplete?.();
    reset();
  };

  return (
    <div className="card animate-[slide-in-left_0.5s_ease-out_0.2s_both]">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-[#c4f547]" />
            Stake TON/WTON
          </h2>

          {/* Mode toggle */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              onClick={() => setMode('quick')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                mode === 'quick'
                  ? 'bg-[#c4f547]/15 text-[#d5f972] shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Zap className="h-3 w-3" />
              Quick
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                mode === 'manual'
                  ? 'bg-[#c4f547]/15 text-[#d5f972] shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Settings2 className="h-3 w-3" />
              Manual
            </button>
          </div>
        </div>

        <p className="text-sm text-white/40">
          {mode === 'quick'
            ? 'One approval + one transaction via the StakingRouter contract.'
            : `Step-by-step staking: ${tokenSource === 'TON' ? 'Approve TON, Swap to WTON, Approve WTON, Deposit for WSTON.' : 'Approve WTON, Deposit for WSTON.'}`
          }
        </p>
      </div>

      {/* Network warning */}
      {isConnected && !isL1 && (
        <div className="mb-4 rounded-lg border border-[#c4f547]/20 bg-[#c4f547]/5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#d5f972]" />
              <p className="text-sm text-[#d5f972]">Switch to Ethereum Mainnet to stake.</p>
            </div>
            <button onClick={switchToL1} className="btn-primary text-xs px-3 py-1">Switch</button>
          </div>
        </div>
      )}

      {!isConnected && (
        <div className="mb-4 rounded-lg border border-[#c4f547]/20 bg-[#c4f547]/5 p-3">
          <p className="text-sm text-[#d5f972]">Connect your wallet to stake.</p>
        </div>
      )}

      {/* Token source toggle */}
      {!isComplete && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-white/60 mb-2">Stake from</label>
          <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5 w-fit">
            {(['TON', 'WTON'] as const).map((source) => (
              <button
                key={source}
                onClick={() => setTokenSource(source)}
                disabled={!isIdle}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                  tokenSource === source
                    ? 'bg-[#c4f547]/15 text-[#d5f972] shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {source}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Token flow visualization */}
      {!isComplete && (
        <div className="mb-6 flex items-center justify-center gap-2 py-3">
          <TokenBadge
            label={tokenSource}
            active={step === 'IDLE' || step === 'APPROVING_TOKEN' || step === 'APPROVING_TON'}
            done={!isIdle && step !== 'APPROVING_TOKEN' && step !== 'APPROVING_TON'}
          />
          {tokenSource === 'TON' && (
            <>
              <ArrowRight className="h-4 w-4 text-white/20" />
              <TokenBadge
                label="WTON"
                active={step === 'SWAPPING_WTON' || step === 'APPROVING_WTON'}
                done={step === 'DEPOSITING_WSTON' || step === 'EXECUTING_ROUTER'}
              />
            </>
          )}
          <ArrowRight className="h-4 w-4 text-white/20" />
          <TokenBadge
            label="WSTON"
            active={step === 'DEPOSITING_WSTON' || step === 'EXECUTING_ROUTER'}
            done={isComplete}
          />
        </div>
      )}

      {/* Amount input */}
      {!isComplete && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-white/60 mb-1">Amount (in {tokenSource})</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!isConnected || !isL1 || isLoading}
              className="input-dark flex-1"
            />
            <button
              onClick={() => {
                if (tokenSource === 'TON' && balances.ton !== undefined) {
                  setAmount(formatUnits(balances.ton, 18));
                } else if (tokenSource === 'WTON' && balances.wton !== undefined) {
                  setAmount(formatUnits(balances.wton, 27));
                }
              }}
              disabled={!isConnected || !isL1 || isLoading}
              className="rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-zinc-300 hover:bg-[#c4f547]/10 hover:border-[#c4f547]/30 hover:text-[#d5f972] disabled:opacity-50 transition-all duration-300"
            >
              MAX
            </button>
            <span className="flex items-center rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-medium text-zinc-300">
              {tokenSource}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/30">
            Available: {tokenSource === 'TON' ? `${formatBalance(balances.ton)} TON` : `${formatWTON(balances.wton)} WTON`}
          </p>
        </div>
      )}

      {/* Estimated output */}
      {!isComplete && amount && parseFloat(amount) > 0 && (
        <div className="mb-4 rounded-lg bg-[#c4f547]/5 border border-[#c4f547]/10 p-3">
          <p className="text-xs text-white/40">
            Estimated WSTON received:{' '}
            <span className="font-semibold text-[#d5f972]">
              {parseFloat(estimatedWSTON).toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </span>
          </p>
        </div>
      )}

      {/* Step progress indicator */}
      {!isIdle && !isComplete && (
        <div className="mb-4">
          <div className="flex items-center gap-1 text-xs mb-3">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                    isStepDone(i)
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : isStepActive(i)
                        ? 'bg-[#c4f547]/20 text-[#d5f972] animate-pulse'
                        : 'bg-white/5 text-white/30'
                  }`}
                >
                  {isStepDone(i) ? (
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                      <path d="M3 6L5 8L9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className={`${
                  isStepDone(i) ? 'text-emerald-400' : isStepActive(i) ? 'text-[#d5f972]' : 'text-white/30'
                }`}>
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <span className="text-white/10 mx-1">--</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-400 mb-2">{error.substring(0, 150)}</p>
              <button
                onClick={retry}
                className="text-xs text-red-300 hover:text-red-200 underline"
              >
                Retry from this step
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {isComplete && (
        <div className="mb-4 animate-[slide-in-left_0.3s_ease-out]">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white mb-1">Staking Complete!</h3>
            <p className="text-sm text-white/40 mb-4">
              You received approximately{' '}
              <span className="font-semibold text-[#d5f972]">
                {result?.wstonReceived
                  ? parseFloat(result.wstonReceived).toLocaleString(undefined, { maximumFractionDigits: 4 })
                  : '-'}{' '}
                WSTON
              </span>
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleComplete}
                className="btn-primary px-6 py-2"
              >
                Done
              </button>
              <button
                onClick={reset}
                className="btn-secondary px-6 py-2"
              >
                Stake More
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action button */}
      {!isComplete && (
        <button
          onClick={handleExecute}
          disabled={!isConnected || !isL1 || !canExecute}
          className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stepLabel} (Step {stepNumber}/{totalSteps})
            </span>
          ) : isError ? (
            'Retry'
          ) : (
            <>
              {stepLabel}
              {totalSteps > 1 && ` (Step ${stepNumber}/${totalSteps})`}
            </>
          )}
        </button>
      )}

      {/* Balance summary */}
      {isConnected && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-white/30">TON</p>
              <p className="text-sm font-medium text-white">{formatBalance(balances.ton)}</p>
            </div>
            <div>
              <p className="text-xs text-white/30">WTON</p>
              <p className="text-sm font-medium text-white">{formatWTON(balances.wton)}</p>
            </div>
            <div>
              <p className="text-xs text-white/30">WSTON</p>
              <p className="text-sm font-medium text-white">{formatWTON(balances.wston)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Sub-components ============

function TokenBadge({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
        done
          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
          : active
            ? 'bg-[#c4f547]/15 border border-[#c4f547]/30 text-[#d5f972] shadow-[0_0_10px_rgba(196,245,71,0.15)]'
            : 'bg-white/5 border border-white/10 text-white/40'
      }`}
    >
      {done && (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
          <path d="M3 6L5 8L9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {active && !done && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#c4f547] animate-pulse" />
      )}
      {label}
    </div>
  );
}
