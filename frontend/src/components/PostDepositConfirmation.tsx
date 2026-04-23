'use client';

import { formatUnits } from 'viem';

interface PostDepositConfirmationProps {
  sharesMinted: bigint;
  assetSymbol: string;
  assetDecimals: number;
  txHash: `0x${string}`;
  explorerUrl?: string;
  onDismiss: () => void;
}

export function PostDepositConfirmation({
  sharesMinted,
  assetSymbol,
  assetDecimals,
  txHash,
  explorerUrl,
  onDismiss,
}: PostDepositConfirmationProps) {
  return (
    <div className="card p-6 space-y-4 border-emerald-500/30">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <span className="text-emerald-400 text-lg">+</span>
        </div>
        <div>
          <h3 className="text-white font-semibold">Deposit Complete</h3>
          <p className="text-sm text-white/50">
            You received {formatUnits(sharesMinted, assetDecimals)} shares
          </p>
        </div>
      </div>

      <div className="bg-white/5 rounded-lg p-4 space-y-2 text-sm text-white/60">
        <p className="font-medium text-white/80">What happens next:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>The vault&apos;s agent executes strategies on your behalf</li>
          <li>Your shares grow in value as the agent generates returns</li>
          <li>You can withdraw anytime (unless a strategy is in progress)</li>
        </ul>
      </div>

      {explorerUrl && (
        <a
          href={`${explorerUrl}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-lime-400 hover:text-lime-300 transition-colors"
        >
          View transaction
        </a>
      )}

      <button onClick={onDismiss} className="btn-secondary w-full py-2">
        Back to Vault
      </button>
    </div>
  );
}
