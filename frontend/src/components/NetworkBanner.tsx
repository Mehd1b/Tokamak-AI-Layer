'use client';

import { useChainId, useSwitchChain, useAccount } from 'wagmi';

interface NetworkBannerProps {
  expectedChainId: number;
  chainName?: string;
}

export function NetworkBanner({ expectedChainId, chainName }: NetworkBannerProps) {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!isConnected || chainId === expectedChainId) return null;

  return (
    <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between mb-4">
      <span className="text-amber-400 text-sm">
        This vault is on {chainName ?? `chain ${expectedChainId}`}. Switch networks to deposit.
      </span>
      <button
        onClick={() => switchChain({ chainId: expectedChainId })}
        className="text-amber-400 text-sm font-semibold hover:text-amber-300 transition-colors"
      >
        Switch Network
      </button>
    </div>
  );
}
