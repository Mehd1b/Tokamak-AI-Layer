'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shield, Send } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useRequestValidationOnChain } from '@/hooks/useValidation';
import { parseEther } from 'viem';

const VALIDATION_MODELS = [
  { value: 0, label: 'Reputation Only', desc: 'Lightweight, aggregated feedback scores', minBounty: '0' },
  { value: 1, label: 'Stake Secured', desc: 'DRB-selected validator with stake collateral', minBounty: '10' },
  { value: 2, label: 'TEE Attested', desc: 'Hardware-attested execution verification', minBounty: '1' },
  { value: 3, label: 'Hybrid', desc: 'Combines stake + TEE for maximum security', minBounty: '10' },
] as const;

const DEADLINE_OPTIONS = [
  { label: '24 hours', seconds: 86400 },
  { label: '48 hours', seconds: 172800 },
  { label: '7 days', seconds: 604800 },
  { label: '30 days', seconds: 2592000 },
] as const;

function isValidBytes32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export default function RequestValidationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isConnected, isCorrectChain } = useWallet();
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
  const [model, setModel] = useState(0);
  const [bountyAmount, setBountyAmount] = useState('');
  const [deadlineSeconds, setDeadlineSeconds] = useState(86400);

  const selectedModel = VALIDATION_MODELS[model];
  const minBounty = selectedModel.minBounty;

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

    const bounty = bountyAmount || '0';
    if (parseFloat(bounty) < parseFloat(minBounty)) return;

    requestValidation({
      agentId: BigInt(agentId),
      taskHash: taskHash as `0x${string}`,
      outputHash: outputHash as `0x${string}`,
      model,
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
            Please switch to the correct network (Thanos Sepolia).
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

        {/* Validation Model */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            <Shield className="mr-2 inline h-5 w-5" />
            Validation Model
          </h2>

          <div className="space-y-3">
            {VALIDATION_MODELS.map((m) => {
              const comingSoon = m.value === 2 || m.value === 3;
              return (
                <label
                  key={m.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    comingSoon
                      ? 'cursor-not-allowed border-white/5 opacity-50'
                      : model === m.value
                        ? 'cursor-pointer border-[#38BDF8]/50 bg-[#38BDF8]/10'
                        : 'cursor-pointer border-white/10 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={m.value}
                    checked={model === m.value}
                    disabled={comingSoon}
                    onChange={() => setModel(m.value)}
                    className="mt-0.5 accent-[#38BDF8]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">
                        {m.label}
                      </p>
                      {comingSoon && (
                        <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                          Coming soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">{m.desc}</p>
                    {m.minBounty !== '0' && !comingSoon && (
                      <p className="mt-1 text-xs text-amber-400">
                        Minimum bounty: {m.minBounty} TON
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Bounty */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Bounty
          </h2>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Bounty Amount (TON) *
            </label>
            <input
              type="number"
              step="0.001"
              min={minBounty}
              value={bountyAmount}
              onChange={(e) => setBountyAmount(e.target.value)}
              required
              placeholder={`Min: ${minBounty} TON`}
              className="mt-1 w-full bg-white/5 border-white/10 text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/50 rounded-lg border px-3 py-2 text-sm focus:outline-none"
            />
            {bountyAmount && parseFloat(bountyAmount) < parseFloat(minBounty) && (
              <p className="mt-1 text-xs text-red-500">
                Minimum bounty for {selectedModel.label} is {minBounty} TON.
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
                  <span className="font-medium">{validatorReward.toFixed(4)} TON</span>
                </div>
                <div className="flex justify-between">
                  <span>Agent reward (10%)</span>
                  <span className="font-medium">{agentReward.toFixed(4)} TON</span>
                </div>
                <div className="flex justify-between">
                  <span>Protocol fee (10%)</span>
                  <span className="font-medium">{protocolFee.toFixed(4)} TON</span>
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
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  deadlineSeconds === opt.seconds
                    ? 'border-[#38BDF8]/50 bg-[#38BDF8]/10 font-medium text-[#38BDF8]'
                    : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/20'
                }`}
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
              isConfirming
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
                href={`https://explorer.thanos-sepolia.tokamak.network/tx/${hash}`}
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
