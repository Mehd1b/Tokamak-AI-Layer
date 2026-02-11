'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shield, Send, Info, AlertTriangle } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useRequestValidationOnChain } from '@/hooks/useValidation';
import { useL2Config } from '@/hooks/useL2Config';
import { parseEther } from 'viem';
import { useReadContract } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts';
import { TALIdentityRegistryV2ABI } from '../../../../../sdk/src/abi/TALIdentityRegistryV2';
import { getValidationModelLabel, getValidationModelColor } from '@/lib/utils';

const MODEL_INFO: Record<number, { desc: string; minBounty: string }> = {
  0: { desc: 'Lightweight, aggregated feedback scores', minBounty: '0' },
  1: { desc: 'DRB-selected validator with stake collateral', minBounty: '10' },
  2: { desc: 'Hardware-attested execution verification', minBounty: '1' },
  3: { desc: 'Combines stake + TEE for maximum security', minBounty: '10' },
};

const DEADLINE_OPTIONS = [
  { label: '24 hours', seconds: 86400 },
  { label: '48 hours', seconds: 172800 },
  { label: '7 days', seconds: 604800 },
  { label: '30 days', seconds: 2592000 },
] as const;

function isValidBytes32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function useAgentValidationModel(agentId: string) {
  const enabled = !!agentId && parseInt(agentId) > 0;
  const { data, isLoading, error } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryV2ABI,
    functionName: 'getAgentValidationModel',
    args: enabled ? [BigInt(agentId)] : undefined,
    query: { enabled },
  });

  return {
    model: data !== undefined ? Number(data) : undefined,
    isLoading: enabled && isLoading,
    error,
  };
}

export default function RequestValidationPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8"><div className="h-8 w-48 animate-pulse rounded bg-white/10" /></div>}>
      <RequestValidationContent />
    </Suspense>
  );
}

function RequestValidationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isConnected, isCorrectChain } = useWallet();
  const { explorerUrl, nativeCurrency, name: l2Name } = useL2Config();
  const {
    requestValidation,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    requestHash,
  } = useRequestValidationOnChain();

  const [agentId, setAgentId] = useState(searchParams.get('agentId') || '');
  const [taskHash, setTaskHash] = useState('');
  const [outputHash, setOutputHash] = useState('');
  const [bountyAmount, setBountyAmount] = useState('');
  const [deadlineSeconds, setDeadlineSeconds] = useState(86400);

  // Auto-detect validation model from agent's on-chain registration
  const { model: agentModel, isLoading: modelLoading } = useAgentValidationModel(agentId);

  const effectiveModel = agentModel ?? 0;
  const modelInfo = MODEL_INFO[effectiveModel] ?? MODEL_INFO[0];
  const minBounty = modelInfo.minBounty;
  const isComingSoon = effectiveModel === 2 || effectiveModel === 3;

  // Redirect after success
  useEffect(() => {
    if (isSuccess && requestHash) {
      const timer = setTimeout(() => {
        router.push(`/validation/${requestHash}`);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, requestHash, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!agentId || !taskHash || !outputHash) return;
    if (!isValidBytes32(taskHash) || !isValidBytes32(outputHash)) return;
    if (isComingSoon) return;

    const bounty = bountyAmount || '0';
    if (parseFloat(bounty) < parseFloat(minBounty)) return;

    requestValidation({
      agentId: BigInt(agentId),
      taskHash: taskHash as `0x${string}`,
      outputHash: outputHash as `0x${string}`,
      model: effectiveModel,
      deadline: BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds),
      bountyWei: parseEther(bounty),
    });
  };

  const bountyNum = parseFloat(bountyAmount || '0');
  const protocolFee = bountyNum * 0.1;
  const agentReward = bountyNum * 0.1;
  const validatorReward = bountyNum * 0.8;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/validation"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Validations
      </Link>

      <h1 className="mb-2 text-3xl font-bold text-white">
        Request Validation
      </h1>
      <p className="mb-8 text-zinc-400">
        Request on-chain validation of an AI agent&apos;s output. A validator will
        re-execute the task and verify the result.
      </p>

      {!isConnected && (
        <div className="card mb-6 border-amber-500/20 bg-amber-500/10">
          <p className="text-sm text-amber-400">
            Please connect your wallet to request a validation.
          </p>
        </div>
      )}

      {isConnected && !isCorrectChain && (
        <div className="card mb-6 border-amber-500/20 bg-amber-500/10">
          <p className="text-sm text-amber-400">
            Please switch to the correct network ({l2Name}).
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Agent & Hashes */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Agent & Task Details
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Agent ID *
              </label>
              <input
                type="number"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                required
                min="1"
                placeholder="e.g. 5"
                className="mt-1 w-full bg-white/5 border-white/10 text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/50 rounded-lg border px-3 py-2 text-sm focus:outline-none"
              />
              <p className="mt-1 text-xs text-zinc-500">
                The on-chain ID of the agent whose output you want to validate.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Task Hash *
              </label>
              <input
                type="text"
                value={taskHash}
                onChange={(e) => setTaskHash(e.target.value)}
                required
                placeholder="0x..."
                className="mt-1 w-full bg-white/5 border-white/10 text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/50 rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none"
              />
              {taskHash && !isValidBytes32(taskHash) && (
                <p className="mt-1 text-xs text-red-500">
                  Must be a valid bytes32 hex string (0x + 64 hex characters).
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                The keccak256 hash of the task that was sent to the agent.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Output Hash *
              </label>
              <input
                type="text"
                value={outputHash}
                onChange={(e) => setOutputHash(e.target.value)}
                required
                placeholder="0x..."
                className="mt-1 w-full bg-white/5 border-white/10 text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/50 rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none"
              />
              {outputHash && !isValidBytes32(outputHash) && (
                <p className="mt-1 text-xs text-red-500">
                  Must be a valid bytes32 hex string (0x + 64 hex characters).
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                The keccak256 hash of the agent&apos;s output to verify.
              </p>
            </div>
          </div>
        </div>

        {/* Validation Model (auto-detected) */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            <Shield className="mr-2 inline h-5 w-5" />
            Validation Model
          </h2>

          {!agentId ? (
            <div className="rounded-lg bg-white/5 p-4 text-center">
              <p className="text-sm text-zinc-500">
                Enter an Agent ID above to detect its validation model.
              </p>
            </div>
          ) : modelLoading ? (
            <div className="rounded-lg bg-white/5 p-4 text-center">
              <p className="text-sm text-zinc-500">
                Loading agent validation model...
              </p>
            </div>
          ) : (
            <div className={`rounded-lg border p-4 ${isComingSoon ? 'border-amber-500/20 bg-amber-500/5' : 'border-[#38BDF8]/30 bg-[#38BDF8]/5'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`${getValidationModelColor(effectiveModel)} text-sm`}>
                      {getValidationModelLabel(effectiveModel)}
                    </span>
                    {isComingSoon && (
                      <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{modelInfo.desc}</p>
                </div>
                {effectiveModel > 0 && !isComingSoon && (
                  <div className="text-right">
                    <p className="text-xs text-zinc-500">Min bounty</p>
                    <p className="text-sm font-medium text-amber-400">{minBounty} {nativeCurrency}</p>
                  </div>
                )}
              </div>

              {isComingSoon && (
                <div className="mt-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-400">
                    {effectiveModel === 2
                      ? 'TEE Attested validation requires TEE infrastructure that is not yet deployed. This agent cannot be validated until TEE provider support is live.'
                      : 'Hybrid validation requires both TEE infrastructure and DRB validator selection, which are not yet deployed.'}
                  </p>
                </div>
              )}

              <div className="mt-3 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-600">
                  The validation model is determined by the agent&apos;s on-chain registration and cannot be changed per request.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bounty */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Bounty
          </h2>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Bounty Amount ({nativeCurrency}) *
            </label>
            <input
              type="number"
              step="0.001"
              min={minBounty}
              value={bountyAmount}
              onChange={(e) => setBountyAmount(e.target.value)}
              required
              disabled={isComingSoon}
              placeholder={`Min: ${minBounty} ${nativeCurrency}`}
              className="mt-1 w-full bg-white/5 border-white/10 text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/50 rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {bountyAmount && parseFloat(bountyAmount) < parseFloat(minBounty) && (
              <p className="mt-1 text-xs text-red-500">
                Minimum bounty for {getValidationModelLabel(effectiveModel)} is {minBounty} {nativeCurrency}.
              </p>
            )}
          </div>

          {bountyNum > 0 && (
            <div className="mt-4 rounded-lg bg-white/5 p-4">
              <p className="mb-2 text-xs font-medium text-zinc-300">
                Bounty Distribution Preview
              </p>
              <div className="space-y-1 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>Validator reward (80%)</span>
                  <span className="font-medium">{validatorReward.toFixed(4)} {nativeCurrency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Agent reward (10%)</span>
                  <span className="font-medium">{agentReward.toFixed(4)} {nativeCurrency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Protocol fee (10%)</span>
                  <span className="font-medium">{protocolFee.toFixed(4)} {nativeCurrency}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Deadline */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Deadline
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DEADLINE_OPTIONS.map((opt) => (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => setDeadlineSeconds(opt.seconds)}
                disabled={isComingSoon}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  deadlineSeconds === opt.seconds
                    ? 'border-[#38BDF8]/50 bg-[#38BDF8]/10 font-medium text-[#38BDF8]'
                    : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            The validation must be completed before this deadline. If expired,
            the bounty is returned to the requester.
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link href="/validation" className="btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={
              !isConnected ||
              !isCorrectChain ||
              !agentId ||
              !taskHash ||
              !outputHash ||
              !isValidBytes32(taskHash) ||
              !isValidBytes32(outputHash) ||
              !bountyAmount ||
              parseFloat(bountyAmount) < parseFloat(minBounty) ||
              isPending ||
              isConfirming ||
              isComingSoon
            }
            className="btn-primary flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            {isPending
              ? 'Confirm in wallet...'
              : isConfirming
                ? 'Confirming...'
                : 'Request Validation'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="card border-red-500/20 bg-red-500/10">
            <p className="text-sm text-red-400">
              <strong>Transaction Error:</strong> {error.message}
            </p>
          </div>
        )}

        {/* Success */}
        {isSuccess && hash && (
          <div className="card border-emerald-500/20 bg-emerald-500/10">
            <p className="text-sm text-emerald-400">
              <strong>Validation requested!</strong> Transaction:{' '}
              <a
                href={`${explorerUrl}/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-emerald-300"
              >
                {hash.slice(0, 10)}...{hash.slice(-8)}
              </a>
            </p>
            {requestHash && (
              <p className="mt-1 text-sm text-emerald-300">
                Request hash: <span className="font-mono">{requestHash.slice(0, 10)}...{requestHash.slice(-8)}</span>
              </p>
            )}
            <p className="mt-1 text-sm text-emerald-300">
              Redirecting to validation details...
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
