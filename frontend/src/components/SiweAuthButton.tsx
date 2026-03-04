'use client';

import { useAccount } from 'wagmi';
import { useSiweAuth } from '@/hooks/useSiweAuth';
import { truncateAddress } from '@/lib/utils';

export function SiweAuthButton() {
  const { address } = useAccount();
  const { isSignedIn, session, signIn, signInPending, signOut, signOutPending, sessionLoading } = useSiweAuth();

  if (!address) {
    return (
      <p className="text-gray-500 text-sm font-mono">
        Connect your wallet to comment.
      </p>
    );
  }

  if (sessionLoading) {
    return (
      <div className="h-9 w-32 bg-white/5 rounded-lg animate-pulse" />
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-gray-400 text-sm font-mono">
          Signed in as <span className="text-[#C084FC]">{truncateAddress(session!, 4)}</span>
        </span>
        <button
          onClick={() => signOut()}
          disabled={signOutPending}
          className="text-gray-500 text-xs hover:text-gray-300 transition-colors"
        >
          {signOutPending ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn()}
      disabled={signInPending}
      className="btn-secondary text-sm"
    >
      {signInPending ? 'Signing...' : 'Sign in to comment'}
    </button>
  );
}
