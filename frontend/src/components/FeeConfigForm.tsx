'use client';

import { useMemo, useState } from 'react';
import { isAddress } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { KernelVaultABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';
import type { VaultFees } from '@/hooks/useVaultFees';

const MAX_MGMT_BPS = 500; // 5%
const MAX_PERF_BPS = 5000; // 50%
const MAX_COMBINED_BPS = 5000; // 50%
const COOLDOWN_SECONDS = 7 * 24 * 60 * 60;

interface FeeConfigFormProps {
  vaultAddress: `0x${string}`;
  currentFees: VaultFees;
}

/*
 * bpsInput accepts decimal percent entry ("2.5") and converts to integer bps.
 * Uses string → number to avoid float precision issues at the 0.01% boundary.
 */
function percentToBps(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function bpsToPercentStr(bps: bigint): string {
  return (Number(bps) / 100).toString();
}

export function FeeConfigForm({ vaultAddress, currentFees }: FeeConfigFormProps) {
  const { selectedChainId } = useNetwork();
  const [mgmtPct, setMgmtPct] = useState<string>(bpsToPercentStr(currentFees.managementFeeBps));
  const [perfPct, setPerfPct] = useState<string>(bpsToPercentStr(currentFees.performanceFeeBps));
  const [recipientInput, setRecipientInput] = useState<string>(currentFees.feeRecipient ?? '');

  const mgmtBps = percentToBps(mgmtPct);
  const perfBps = percentToBps(perfPct);

  const validationError = useMemo(() => {
    if (mgmtBps === null) return 'Management fee must be a non-negative number';
    if (perfBps === null) return 'Performance fee must be a non-negative number';
    if (mgmtBps > MAX_MGMT_BPS) return 'Management fee exceeds 5% (max 500 bps)';
    if (perfBps > MAX_PERF_BPS) return 'Performance fee exceeds 50% (max 5000 bps)';
    if (mgmtBps + perfBps > MAX_COMBINED_BPS) return 'Combined fees exceed 50% (max 5000 bps)';
    if (recipientInput.trim() !== '' && !isAddress(recipientInput.trim())) {
      return 'Fee recipient must be a valid address';
    }
    return null;
  }, [mgmtBps, perfBps, recipientInput]);

  const cooldownRemaining = useMemo(() => {
    if (currentFees.lastFeeRateChange === 0n) return 0;
    const cooldownEnd = Number(currentFees.lastFeeRateChange) + COOLDOWN_SECONDS;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, cooldownEnd - now);
  }, [currentFees.lastFeeRateChange]);

  const feesUnchanged
    = mgmtBps !== null
    && perfBps !== null
    && BigInt(mgmtBps) === currentFees.managementFeeBps
    && BigInt(perfBps) === currentFees.performanceFeeBps;

  const feesLocked = cooldownRemaining > 0 && !feesUnchanged;

  const { data: setFeesHash, writeContract: writeSetFees, isPending: isSetFeesPending, error: setFeesError } = useWriteContract();
  const { isLoading: isSetFeesConfirming, isSuccess: isSetFeesSuccess } = useWaitForTransactionReceipt({
    hash: setFeesHash,
    chainId: selectedChainId,
  });

  const { data: setRecipientHash, writeContract: writeSetRecipient, isPending: isRecipientPending, error: recipientError } = useWriteContract();
  const { isLoading: isRecipientConfirming, isSuccess: isRecipientSuccess } = useWaitForTransactionReceipt({
    hash: setRecipientHash,
    chainId: selectedChainId,
  });

  const isBusy = isSetFeesPending || isSetFeesConfirming || isRecipientPending || isRecipientConfirming;
  const recipientTrimmed = recipientInput.trim();
  const recipientChanged
    = recipientTrimmed !== ''
    && isAddress(recipientTrimmed)
    && recipientTrimmed.toLowerCase() !== (currentFees.feeRecipient ?? '').toLowerCase();

  const canSubmit = !validationError && !isBusy && !feesLocked
    && mgmtBps !== null && perfBps !== null
    && (!feesUnchanged || recipientChanged);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || mgmtBps === null || perfBps === null) return;

    // Call setFees only if values changed (avoid wasting a tx + restarting cooldown)
    if (!feesUnchanged) {
      writeSetFees({
        address: vaultAddress,
        abi: KernelVaultABI,
        functionName: 'setFees',
        args: [BigInt(mgmtBps), BigInt(perfBps)],
        chainId: selectedChainId,
      });
    }

    if (recipientChanged) {
      writeSetRecipient({
        address: vaultAddress,
        abi: KernelVaultABI,
        functionName: 'setFeeRecipient',
        args: [recipientTrimmed as `0x${string}`],
        chainId: selectedChainId,
      });
    }
  }

  const formatCooldown = (secs: number): string => {
    if (secs <= 0) return '';
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((secs % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>
      {feesLocked && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-xs text-amber-400">
            Fee rate cooldown: {formatCooldown(cooldownRemaining)} remaining.
          </p>
          <p className="text-[10px] text-gray-500 mt-1">
            After calling setFees, the contract enforces a 7-day cooldown before rates can change again.
          </p>
        </div>
      )}

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-600 mb-1.5">
          Management Fee (%)
        </label>
        <div className="input-dark-wrapper">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="5"
            step="0.01"
            value={mgmtPct}
            onChange={(e) => setMgmtPct(e.target.value)}
            placeholder="0.00"
            disabled={isBusy}
            className="input-dark font-mono w-full"
          />
        </div>
        <p className="text-[10px] text-gray-600 mt-1">Annual, taken on total AUM. Max 5%.</p>
      </div>

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-600 mb-1.5">
          Performance Fee (%)
        </label>
        <div className="input-dark-wrapper">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="50"
            step="0.01"
            value={perfPct}
            onChange={(e) => setPerfPct(e.target.value)}
            placeholder="0.00"
            disabled={isBusy}
            className="input-dark font-mono w-full"
          />
        </div>
        <p className="text-[10px] text-gray-600 mt-1">Taken on PPS gains above the high water mark. Max 50%.</p>
      </div>

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-600 mb-1.5">
          Fee Recipient (optional)
        </label>
        <div className="input-dark-wrapper">
          <input
            type="text"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            placeholder="0x..."
            disabled={isBusy}
            className="input-dark font-mono w-full"
          />
        </div>
        <p className="text-[10px] text-gray-600 mt-1">
          Leave unchanged to keep the current recipient. Protocol split uses its own recipient (protocolTreasury).
        </p>
      </div>

      {validationError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5">
          <p className="text-xs text-red-400">{validationError}</p>
        </div>
      )}

      {(setFeesError || recipientError) && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5">
          <p className="text-xs text-red-400 break-all">
            {setFeesError?.message ?? recipientError?.message}
          </p>
        </div>
      )}

      {(isSetFeesSuccess || isRecipientSuccess) && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
          <p className="text-xs text-emerald-400">
            {isSetFeesSuccess && 'Fee rates updated. '}
            {isRecipientSuccess && 'Fee recipient updated.'}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isBusy ? 'Submitting…' : 'Update Fees'}
        </button>
        <p className="text-[10px] text-gray-600">
          Combined cap: {((mgmtBps ?? 0) + (perfBps ?? 0)) / 100}% / 50%
        </p>
      </div>
    </form>
  );
}
