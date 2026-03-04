'use client';

import Link from 'next/link';
import { truncateAddress, truncateBytes32, formatEther } from '@/lib/utils';
import { NetworkBadge } from '@/components/NetworkLogo';

interface VaultCardProps {
  address: string;
  agentId: string;
  asset: string;
  totalAssets: bigint;
  totalShares: bigint;
  totalValueLocked?: bigint;
  assetDecimals: number;
  assetSymbol: string;
  commentCount?: number;
}

export function VaultCard({ address, agentId, asset, totalAssets, totalShares, totalValueLocked, assetDecimals, assetSymbol, commentCount }: VaultCardProps) {
  return (
    <Link href={`/vaults/${address}`}>
      <div className="card-hover cursor-pointer group">
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
            style={{
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#A855F7]" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <NetworkBadge />
            <span className="badge-info">Vault</span>
          </div>
        </div>

        <h3
          className="text-sm font-medium text-[#A855F7] mb-2"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          {truncateAddress(address, 6)}
        </h3>

        <div className="space-y-2 text-xs text-gray-400" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          <div className="flex justify-between">
            <span className="text-gray-500">Agent ID</span>
            <span>{truncateBytes32(agentId)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Asset</span>
            <span>{truncateAddress(asset)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">TVL</span>
            <span>{formatEther(totalValueLocked ?? totalAssets, assetDecimals)} {assetSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Vault Balance</span>
            <span>{formatEther(totalAssets, assetDecimals)} {assetSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total Shares</span>
            <span>{formatEther(totalShares, assetDecimals)}</span>
          </div>
        </div>

        {/* Bottom indicator line */}
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-px flex-1 rounded-full transition-all duration-500 origin-left scale-x-0 group-hover:scale-x-100"
            style={{ background: 'linear-gradient(90deg, #A855F7, transparent)' }}
          />
          {commentCount !== undefined && commentCount > 0 && (
            <span className="flex items-center gap-1 text-gray-500 text-xs font-mono">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              {commentCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
