'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { truncateAddress } from '@/lib/utils';
import { useNetwork } from '@/lib/NetworkContext';
import {
  useReferrerCode,
  useReferralPoints,
  useReferralCount,
  useReferrals,
  useReferredBy,
  useRegisterCode,
  usePointsPerDeposit,
  useReferralAvailable,
  hashReferralCode,
  ZERO_BYTES32,
  ZERO_ADDRESS,
} from '@/hooks/useReferral';
import Link from 'next/link';

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokagent.network';

export default function ReferralsPage() {
  const { address: userAddress, isConnected } = useAccount();
  const { explorerUrl } = useNetwork();
  const referralAvailable = useReferralAvailable();

  // Read on-chain state
  const { data: codeHash, refetch: refetchCode } = useReferrerCode(userAddress as `0x${string}` | undefined);
  const { data: points } = useReferralPoints(userAddress as `0x${string}` | undefined);
  const { data: count } = useReferralCount(userAddress as `0x${string}` | undefined);
  const { data: referrals } = useReferrals(userAddress as `0x${string}` | undefined);
  const { data: referredByAddr } = useReferredBy(userAddress as `0x${string}` | undefined);
  const { data: pointsPerDep } = usePointsPerDeposit();

  // Register code state
  const [codeInput, setCodeInput] = useState('');
  const { register, isPending, isConfirming, isSuccess, error } = useRegisterCode();

  // Clipboard state
  const [copied, setCopied] = useState(false);

  const hasCode = codeHash && codeHash !== ZERO_BYTES32;
  const hasBeenReferred = referredByAddr && referredByAddr !== ZERO_ADDRESS;

  // Generate share link from the user's code input or stored hash
  // Since we store hashes on-chain, the share link uses the plaintext code the user typed.
  // We keep it in localStorage for the referrer to copy later.
  const [storedCode, setStoredCode] = useState<string>(() => {
    if (typeof window !== 'undefined' && userAddress) {
      return localStorage.getItem(`referral-code-${userAddress}`) ?? '';
    }
    return '';
  });

  const shareLink = storedCode ? `${SITE_DOMAIN}/vaults?ref=${encodeURIComponent(storedCode)}` : '';

  const handleRegister = () => {
    if (!codeInput.trim()) return;
    register(codeInput.trim());
    // Store plaintext locally so user can copy it later
    if (userAddress) {
      localStorage.setItem(`referral-code-${userAddress}`, codeInput.trim());
      setStoredCode(codeInput.trim());
    }
  };

  const handleCopy = useCallback(async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = shareLink;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareLink]);

  // Refetch code after successful registration
  if (isSuccess && !hasCode) {
    refetchCode();
  }

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
      {/* Breadcrumbs */}
      <nav className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <span className="text-gray-400">Referrals</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono">
            Referral Program
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Invite</span>{' '}
          <span className="text-white">& Earn</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Share your referral link and earn points for every deposit made through your code.
          {pointsPerDep !== undefined && (
            <span className="text-gray-400"> Each referred deposit earns {Number(pointsPerDep)} points.</span>
          )}
        </p>
      </div>

      {/* Wallet not connected */}
      {!isConnected && (
        <div className="card text-center py-16">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#A855F7]/5 border border-[#A855F7]/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#A855F7]/40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-2">Connect your wallet to access referrals</p>
          <p className="text-gray-600 text-xs font-mono mb-6">
            Register a referral code, share your link, and track your earnings.
          </p>
          <div className="flex justify-center">
            <ConnectWalletButton />
          </div>
        </div>
      )}

      {/* Contract not deployed */}
      {isConnected && !referralAvailable && (
        <div className="card text-center py-16">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-500/5 border border-yellow-500/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-yellow-500/40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Referral system not yet deployed</p>
          <p className="text-gray-600 text-xs font-mono">
            The ReferralManager contract is not available on the current network. Check back soon.
          </p>
        </div>
      )}

      {/* Main content - connected and available */}
      {isConnected && referralAvailable && (
        <div className="space-y-8">
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Your Points
              </div>
              <div className="text-3xl font-light text-white font-mono">
                {points !== undefined ? Number(points).toLocaleString() : '0'}
              </div>
            </div>
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Referrals
              </div>
              <div className="text-3xl font-light text-white font-mono">
                {count !== undefined ? Number(count).toLocaleString() : '0'}
              </div>
            </div>
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Points / Deposit
              </div>
              <div className="text-3xl font-light text-[#A855F7] font-mono">
                {pointsPerDep !== undefined ? Number(pointsPerDep).toLocaleString() : '100'}
              </div>
            </div>
          </div>

          {/* Referral code section */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.15)',
                }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#A855F7]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.122a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                </svg>
              </div>
              <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Your Referral Code
              </h2>
            </div>

            {hasCode && storedCode ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    Registered
                  </span>
                  <span className="text-white font-mono text-sm">{storedCode}</span>
                </div>

                {/* Share link */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-mono uppercase tracking-wider">
                    Share Link
                  </label>
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 font-mono text-sm text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">
                      {shareLink}
                    </div>
                    <button
                      onClick={handleCopy}
                      className="btn-primary px-4 flex items-center gap-2 whitespace-nowrap"
                    >
                      {copied ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : hasCode && !storedCode ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    Registered
                  </span>
                  <span className="text-gray-400 font-mono text-xs">
                    Code hash: {typeof codeHash === 'string' ? `${codeHash.slice(0, 10)}...${codeHash.slice(-8)}` : ''}
                  </span>
                </div>
                <p className="text-gray-500 text-xs font-mono">
                  Your code is registered on-chain. If you previously registered from this browser, enter it again below to recover your share link.
                </p>
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    placeholder="Enter your existing code to recover link..."
                    className="input-dark font-mono flex-1"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      if (codeInput.trim() && userAddress) {
                        const hash = hashReferralCode(codeInput.trim());
                        if (hash === codeHash) {
                          localStorage.setItem(`referral-code-${userAddress}`, codeInput.trim());
                          setStoredCode(codeInput.trim());
                          setCodeInput('');
                        }
                      }
                    }}
                    className="btn-secondary px-4 whitespace-nowrap"
                  >
                    Recover
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-400 text-sm">
                  Choose a unique referral code and register it on-chain. This code will be permanently linked to your wallet address.
                </p>
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    placeholder="e.g., alice2026, defi-king, my-ref-code"
                    className="input-dark font-mono flex-1"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    disabled={isPending || isConfirming}
                  />
                  <button
                    onClick={handleRegister}
                    disabled={!codeInput.trim() || isPending || isConfirming}
                    className="btn-primary px-6 whitespace-nowrap inline-flex items-center gap-2"
                  >
                    {(isPending || isConfirming) && (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : 'Register Code'}
                  </button>
                </div>
                {error && (
                  <div className="flex items-start gap-2 text-red-400 text-sm font-mono p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error.message?.includes('CodeAlreadyTaken')
                      ? 'This code is already taken. Please choose a different one.'
                      : error.message?.includes('AlreadyHasCode')
                        ? 'You already have a registered referral code.'
                        : error.message?.includes('EmptyCode')
                          ? 'Code cannot be empty.'
                          : 'Transaction failed. Please try again.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Referred by section */}
          {hasBeenReferred && (
            <div className="card">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium bg-violet-500/10 text-violet-400 border-violet-500/20">
                  Referred By
                </span>
                <a
                  href={`${explorerUrl}/address/${referredByAddr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#A855F7] text-sm font-mono hover:underline"
                >
                  {truncateAddress(referredByAddr as string, 6)}
                </a>
              </div>
            </div>
          )}

          {/* Referral history table */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.15)',
                }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#A855F7]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </div>
              <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Referral History
              </h2>
            </div>

            {referrals && (referrals as `0x${string}`[]).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-white/5">
                      <th className="pb-3 pr-4">#</th>
                      <th className="pb-3 pr-4">Depositor</th>
                      <th className="pb-3 text-right">Explorer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(referrals as `0x${string}`[]).map((depositor, i) => (
                      <tr key={depositor} className="border-b border-white/5 last:border-0">
                        <td className="py-3 pr-4 text-gray-600">{i + 1}</td>
                        <td className="py-3 pr-4 text-gray-300">
                          {truncateAddress(depositor, 6)}
                        </td>
                        <td className="py-3 text-right">
                          <a
                            href={`${explorerUrl}/address/${depositor}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#A855F7] hover:underline text-xs"
                          >
                            View
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm font-mono">No referrals yet</p>
                <p className="text-gray-600 text-xs font-mono mt-1">
                  Share your referral link and earn points when others deposit.
                </p>
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.15)',
                }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#A855F7]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                How It Works
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[#A855F7] font-mono font-bold text-sm">
                  1
                </div>
                <h3 className="text-white text-sm font-medium mb-1">Register a Code</h3>
                <p className="text-gray-500 text-xs font-mono">
                  Choose a unique referral code and register it on-chain.
                </p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[#A855F7] font-mono font-bold text-sm">
                  2
                </div>
                <h3 className="text-white text-sm font-medium mb-1">Share Your Link</h3>
                <p className="text-gray-500 text-xs font-mono">
                  Copy your personalized link and share it with friends.
                </p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[#A855F7] font-mono font-bold text-sm">
                  3
                </div>
                <h3 className="text-white text-sm font-medium mb-1">Earn Points</h3>
                <p className="text-gray-500 text-xs font-mono">
                  Earn {pointsPerDep !== undefined ? Number(pointsPerDep) : 100} points for every deposit via your code.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
