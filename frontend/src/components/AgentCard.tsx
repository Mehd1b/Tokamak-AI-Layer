import Link from 'next/link';
import { ChevronRight, Shield, Star } from 'lucide-react';

interface AgentCardProps {
  agentId: number;
  owner?: string;
  isVerified?: boolean;
  feedbackCount?: number;
  clientCount?: number;
}

export function AgentCard({
  agentId,
  owner,
  isVerified,
  feedbackCount,
  clientCount,
}: AgentCardProps) {
  return (
    <Link
      href={`/agents/${agentId}`}
      className="card flex items-center justify-between transition-all hover:border-[#38BDF8]/30 hover:-translate-y-1"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#38BDF8]/20 text-[#38BDF8] font-bold">
          #{agentId}
        </div>
        <div>
          <h3 className="font-semibold text-white">Agent #{agentId}</h3>
          {owner && (
            <p className="text-sm text-zinc-500">
              {owner.slice(0, 6)}...{owner.slice(-4)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {feedbackCount !== undefined && (
          <div className="hidden items-center gap-1 sm:flex">
            <Star className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-zinc-400">{feedbackCount}</span>
          </div>
        )}
        {isVerified && (
          <div className="hidden items-center gap-1 sm:flex">
            <Shield className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-emerald-400">Verified</span>
          </div>
        )}
        <ChevronRight className="h-5 w-5 text-zinc-600" />
      </div>
    </Link>
  );
}
