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
      className="card flex items-center justify-between transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tokamak-100 text-tokamak-700 font-bold">
          #{agentId}
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Agent #{agentId}</h3>
          {owner && (
            <p className="text-sm text-gray-500">
              {owner.slice(0, 6)}...{owner.slice(-4)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {feedbackCount !== undefined && (
          <div className="hidden items-center gap-1 sm:flex">
            <Star className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-gray-600">{feedbackCount}</span>
          </div>
        )}
        {isVerified && (
          <div className="hidden items-center gap-1 sm:flex">
            <Shield className="h-4 w-4 text-green-500" />
            <span className="text-xs text-green-700">Verified</span>
          </div>
        )}
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </div>
    </Link>
  );
}
