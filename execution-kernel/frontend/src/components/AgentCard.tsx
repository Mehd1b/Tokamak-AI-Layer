'use client';

import Link from 'next/link';
import { truncateBytes32, truncateAddress } from '@/lib/utils';

interface AgentCardProps {
  agentId: string;
  author: string;
  imageId: string;
  exists: boolean;
}

export function AgentCard({ agentId, author, imageId, exists }: AgentCardProps) {
  return (
    <Link href={`/agents/${agentId}`}>
      <div className="card-hover cursor-pointer group">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            {/* Agent icon */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
              style={{
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.2)',
              }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#A855F7]" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>
            <div>
              <span className={exists ? 'badge-success' : 'badge-error'}>
                {exists ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>

        <h3
          className="text-sm font-medium text-[#A855F7] mb-2 truncate"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          {truncateBytes32(agentId, 10)}
        </h3>

        <div className="space-y-2 text-xs text-gray-400" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          <div className="flex justify-between">
            <span className="text-gray-500">Author</span>
            <span>{truncateAddress(author)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Image ID</span>
            <span>{truncateBytes32(imageId)}</span>
          </div>
        </div>

        {/* Bottom indicator line */}
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-px flex-1 rounded-full transition-all duration-500 origin-left scale-x-0 group-hover:scale-x-100"
            style={{ background: 'linear-gradient(90deg, #A855F7, transparent)' }}
          />
        </div>
      </div>
    </Link>
  );
}
