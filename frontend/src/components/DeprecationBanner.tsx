'use client';

import { useAgentDeprecation } from '@/hooks/useAgentDeprecation';
import { truncateBytes32 } from '@/lib/utils';

interface DeprecationBannerProps {
  agentId: `0x${string}`;
  registryAddress: `0x${string}`;
}

export function DeprecationBanner({ agentId }: DeprecationBannerProps) {
  const { isDeprecated, successorAgentId, isLoading } = useAgentDeprecation(agentId);

  if (isLoading || !isDeprecated) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        {/* Warning triangle icon */}
        <div className="mt-0.5 flex-shrink-0">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-amber-500"
          >
            <path
              d="M8.572 3.802L1.536 15.998C1.378 16.272 1.294 16.582 1.294 16.898C1.294 17.214 1.378 17.524 1.536 17.798C1.694 18.072 1.92 18.298 2.194 18.456C2.468 18.614 2.778 18.698 3.094 18.698H17.166C17.482 18.698 17.792 18.614 18.066 18.456C18.34 18.298 18.566 18.072 18.724 17.798C18.882 17.524 18.966 17.214 18.966 16.898C18.966 16.582 18.882 16.272 18.724 15.998L11.688 3.802C11.53 3.528 11.304 3.302 11.03 3.144C10.756 2.986 10.446 2.902 10.13 2.902C9.814 2.902 9.504 2.986 9.23 3.144C8.956 3.302 8.73 3.528 8.572 3.802Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10.13 8.298V11.698"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10.13 15.098H10.14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium text-amber-400"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            This agent has been deprecated by its author
          </p>

          {successorAgentId && (
            <div className="mt-2">
              <p
                className="text-xs text-amber-400/70"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                A newer version is available
              </p>
              <p
                className="mt-1 text-xs text-amber-500/60"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
                title={successorAgentId}
              >
                Successor: {truncateBytes32(successorAgentId)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
