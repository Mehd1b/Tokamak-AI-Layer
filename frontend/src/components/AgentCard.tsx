'use client';

import Link from 'next/link';
import { truncateBytes32, truncateAddress } from '@/lib/utils';
import { NetworkBadge } from '@/components/NetworkLogo';

interface AgentCardProps {
  agentId: string;
  author: string;
  imageId: string;
  exists: boolean;
  index?: number;
}

export function AgentCard({ agentId, author, imageId, exists, index = 0 }: AgentCardProps) {
  /* Derive a unique hue from the agentId for visual differentiation */
  const hueFromId = parseInt(agentId.slice(2, 8), 16) % 360;

  return (
    <Link href={`/agents/${agentId}`}>
      <div
        className={`
          relative overflow-hidden rounded-2xl border
          bg-[#12121a]/80 backdrop-blur-sm
          p-5 cursor-pointer group
          transition-all duration-500 ease-out
          hover:-translate-y-1
          ${exists
            ? 'border-white/10 hover:border-[#A855F7]/30 group-hover:shadow-[0_0_30px_rgba(168,85,247,0.12)]'
            : 'border-white/5 hover:border-white/15 opacity-60'
          }
          vault-card-enter
        `}
        style={{ animationDelay: `${index * 60}ms` }}
      >
        {/* Subtle top-edge gradient */}
        <div
          className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: 'linear-gradient(90deg, transparent, #A855F7, transparent)' }}
        />

        {/* Row 1: Visual identity + badges */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Unique color swatch derived from agentId */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
              style={{
                background: `linear-gradient(135deg, hsl(${hueFromId}, 60%, 20%), hsl(${(hueFromId + 40) % 360}, 50%, 15%))`,
                border: `1px solid hsl(${hueFromId}, 50%, 30%)`,
              }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke={`hsl(${hueFromId}, 70%, 65%)`} strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>
            <div>
              <span className={`text-[10px] font-semibold uppercase tracking-widest font-mono ${exists ? 'text-emerald-400' : 'text-red-400'}`}>
                {exists ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <NetworkBadge />
        </div>

        {/* Row 2: Agent ID — prominent */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">
            Agent ID
          </p>
          <p
            className="text-sm font-medium text-[#C084FC] font-mono truncate group-hover:text-white transition-colors duration-300"
          >
            {truncateBytes32(agentId, 10)}
          </p>
        </div>

        {/* Row 3: Metadata */}
        <div className="space-y-2">
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">Author</p>
            <p className="text-xs text-gray-300 font-mono">{truncateAddress(author, 6)}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">Image ID</p>
            <p className="text-xs text-gray-300 font-mono">{truncateBytes32(imageId, 8)}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
