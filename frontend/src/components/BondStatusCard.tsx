'use client';

import { useBondDetails } from '@/hooks/useBondDetails';
import { formatEther, formatDuration, truncateAddress } from '@/lib/utils';
import { useNetwork } from '@/lib/NetworkContext';

interface BondStatusCardProps {
  bondManagerAddress: `0x${string}`;
  minBond: bigint | undefined;
  challengeWindow: bigint | undefined;
}

export function BondStatusCard({
  bondManagerAddress,
  minBond,
  challengeWindow,
}: BondStatusCardProps) {
  const { explorerUrl } = useNetwork();
  const {
    totalLockedGlobal,
    finderFeeBps,
    depositorShareBps,
    treasuryShareBps,
    bondExpiry,
    trustedRelayer,
    isLoading,
  } = useBondDetails(bondManagerAddress);

  const finderPct = finderFeeBps / 100;
  const depositorPct = depositorShareBps / 100;
  const treasuryPct = treasuryShareBps / 100;

  const relayerIsSet = trustedRelayer && trustedRelayer !== '0x0000000000000000000000000000000000000000';

  return (
    <div className="card mb-8">
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
          }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
            Bond &amp; Slash Mechanics
          </h2>
        </div>
      </div>

      <div className="space-y-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>
        <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
          <span className="text-gray-500 text-sm">Minimum Bond</span>
          <span className="text-gray-300 text-sm">
            {minBond !== undefined ? `${formatEther(minBond, 27)} WSTON` : '-'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
          <span className="text-gray-500 text-sm">Challenge Window</span>
          <span className="text-gray-300 text-sm">
            {challengeWindow !== undefined ? formatDuration(challengeWindow) : '-'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
          <span className="text-gray-500 text-sm">Bond Expiry</span>
          <span className="text-gray-300 text-sm">
            {bondExpiry !== undefined ? formatDuration(bondExpiry) : isLoading ? '...' : '-'}
          </span>
        </div>

        <div className="flex flex-col py-3 border-b border-white/5">
          <span className="text-gray-500 text-sm mb-3">Slash Distribution</span>
          <div className="w-full">
            <div className="flex w-full h-3 rounded-full overflow-hidden">
              <div
                className="h-full"
                style={{ width: `${finderPct}%`, background: '#06b6d4' }}
              />
              <div
                className="h-full"
                style={{ width: `${depositorPct}%`, background: '#22c55e' }}
              />
              <div
                className="h-full"
                style={{ width: `${treasuryPct}%`, background: '#a855f7' }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-cyan-400">{finderPct}% Finder</span>
              <span className="text-xs text-green-400">{depositorPct}% Depositors</span>
              <span className="text-xs text-purple-400">{treasuryPct}% Treasury</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
          <span className="text-gray-500 text-sm">Trusted Relayer</span>
          {relayerIsSet ? (
            <a
              href={`${explorerUrl}/address/${trustedRelayer}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#A855F7] text-sm hover:underline"
            >
              {truncateAddress(trustedRelayer, 6)}
            </a>
          ) : (
            <span className="text-red-400 text-sm">Not Set</span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between py-3">
          <span className="text-gray-500 text-sm">Total Locked (Global)</span>
          <span className="text-gray-300 text-sm">
            {totalLockedGlobal !== undefined ? `${formatEther(totalLockedGlobal, 27)} WSTON` : isLoading ? '...' : '-'}
          </span>
        </div>
      </div>
    </div>
  );
}
