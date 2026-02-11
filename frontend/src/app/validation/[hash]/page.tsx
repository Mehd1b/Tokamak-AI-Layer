'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertTriangle,
  Shield,
  Copy,
  CheckCircle as Check,
  Play,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useValidation, useIsDisputed, useRequestValidation, useDisputeValidation } from '@/hooks/useValidation';
import { useL2Config } from '@/hooks/useL2Config';
import {
  shortenAddress,
  getValidationModelLabel,
  getValidationStatusLabel,
  getStatusColor,
  formatBigInt,
} from '@/lib/utils';
import { useState, useEffect } from 'react';
import { toHex } from 'viem';

function useCountdown(deadline: bigint | undefined) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!deadline || deadline === 0n) return;
    const target = Number(deadline) * 1000;

    const update = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining('Expired');
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      if (days > 0) {
        setRemaining(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setRemaining(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setRemaining(`${minutes}m ${seconds}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return remaining;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function getMatchTypeBadge(matchType: string): string {
  switch (matchType) {
    case 'exact': return 'badge-success';
    case 'semantic': return 'badge-info';
    case 'partial': return 'badge-warning';
    case 'mismatch': return 'badge-error';
    default: return 'badge-info';
  }
}

export default function ValidationDetailPage() {
  const params = useParams();
  const hash = params?.hash as `0x${string}` | undefined;
  const { explorerUrl, nativeCurrency } = useL2Config();
  const { validation, isLoading } = useValidation(hash);
  const { isDisputed } = useIsDisputed(hash);
  const [copied, setCopied] = useState(false);

  // Validation execution state
  const { validate, result: execResult, isValidating, error: execError, reset: resetExec } = useRequestValidation();

  // Countdown timer for pending validations
  const deadlineValue = validation ? validation[0].deadline : undefined;
  const countdown = useCountdown(validation?.[0].status === 0 ? deadlineValue : undefined);

  // Dispute form state
  const { disputeValidation, hash: disputeHash, isPending: isDisputePending, isConfirming: isDisputeConfirming, isSuccess: isDisputeSuccess, error: disputeError } = useDisputeValidation();
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [evidenceText, setEvidenceText] = useState('');

  const copyHash = () => {
    if (hash) {
      navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExecuteValidation = async () => {
    if (!validation) return;
    const agentId = validation[0].agentId.toString();
    const taskId = validation[0].taskHash;
    await validate(agentId, taskId, hash);
  };

  const handleDisputeSubmit = () => {
    if (!hash || !evidenceText.trim()) return;
    disputeValidation({
      requestHash: hash,
      evidence: toHex(evidenceText) as `0x${string}`,
    });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-zinc-500">Loading validation details...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/validation"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Validations
      </Link>

      {/* Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Validation Request
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-sm text-zinc-500">
                {hash ? shortenAddress(hash, 8) : 'Unknown'}
              </span>
              <button
                onClick={copyHash}
                className="text-zinc-600 hover:text-zinc-400"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
          {isDisputed && (
            <span className="badge-error flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Disputed
            </span>
          )}
        </div>
      </div>

      {!validation ? (
        <div className="card py-12 text-center">
          <Shield className="mx-auto h-12 w-12 text-zinc-600" />
          <h3 className="mt-4 text-lg font-semibold text-white">
            Validation Not Found
          </h3>
          <p className="mt-2 text-sm text-zinc-500">
            This validation request hash does not exist on-chain or has not been
            indexed yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Request Details */}
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Request Details
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-zinc-500">Request Hash</dt>
                <dd className="mt-1 truncate font-mono text-sm text-white">
                  {hash}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Agent ID</dt>
                <dd className="mt-1 text-sm text-white">
                  <Link
                    href={`/agents/${validation[0].agentId}`}
                    className="text-[#38BDF8] hover:underline"
                  >
                    #{validation[0].agentId.toString()}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Requester</dt>
                <dd className="mt-1 font-mono text-sm text-white">
                  {shortenAddress(validation[0].requester)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Task Hash</dt>
                <dd className="mt-1 truncate font-mono text-sm text-white">
                  {shortenAddress(validation[0].taskHash)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Output Hash</dt>
                <dd className="mt-1 truncate font-mono text-sm text-white">
                  {shortenAddress(validation[0].outputHash)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Trust Model</dt>
                <dd className="mt-1 text-sm text-white">
                  {getValidationModelLabel(validation[0].model)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Bounty</dt>
                <dd className="mt-1 text-sm text-white">
                  {validation[0].bounty > 0n
                    ? `${formatBigInt(validation[0].bounty)} ${nativeCurrency}`
                    : 'None'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Deadline</dt>
                <dd className="mt-1 text-sm text-white">
                  {validation[0].deadline > 0n
                    ? new Date(Number(validation[0].deadline) * 1000).toLocaleString()
                    : 'No deadline'}
                </dd>
                {validation[0].status === 0 && countdown && (
                  <dd className={`mt-0.5 text-xs font-medium ${countdown === 'Expired' ? 'text-red-400' : 'text-amber-400'}`}>
                    {countdown === 'Expired' ? 'Deadline expired' : `${countdown} remaining`}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Status</dt>
                <dd className="mt-1">
                  <span className={getStatusColor(validation[0].status)}>
                    {getValidationStatusLabel(validation[0].status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Disputed</dt>
                <dd className="mt-1 text-sm text-white">
                  {isDisputed ? 'Yes' : 'No'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Validation Result */}
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Validation Result
            </h2>
            {validation[0].status === 0 ? (
              <div className="space-y-4">
                {/* Execute Validation Section */}
                {!execResult && !execError && (
                  <div className="rounded-lg bg-white/5 p-6 text-center">
                    <Play className="mx-auto h-8 w-8 text-[#38BDF8]" />
                    <p className="mt-2 text-sm text-zinc-500">
                      This validation is pending. Trigger agent runtime validation below.
                    </p>
                    <button
                      onClick={handleExecuteValidation}
                      disabled={isValidating}
                      className="btn-primary mt-4 inline-flex items-center gap-2"
                    >
                      {isValidating ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Validating...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Execute Validation
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Execution Result */}
                {execResult && (
                  <div className="card border-emerald-500/20 bg-emerald-500/10">
                    <h3 className="mb-3 text-sm font-semibold text-emerald-400">Validation Result</h3>
                    <div className="space-y-3">
                      <div>
                        <dt className="text-xs text-emerald-300">Score</dt>
                        <dd className="mt-1">
                          <div className="relative h-4 w-full rounded-full bg-white/10">
                            <div
                              className={`h-4 rounded-full ${getScoreColor(execResult.score)}`}
                              style={{ width: `${execResult.score}%` }}
                            />
                          </div>
                          <p className={`mt-1 text-center text-2xl font-bold ${getScoreTextColor(execResult.score)}`}>
                            {execResult.score}/100
                          </p>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-emerald-300">Match Type</dt>
                        <dd className="mt-1">
                          <span className={getMatchTypeBadge(execResult.matchType)}>
                            {execResult.matchType}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-emerald-300">Re-execution Hash</dt>
                        <dd className="mt-1 truncate font-mono text-xs text-emerald-200">
                          {execResult.reExecutionHash}
                        </dd>
                      </div>
                    </div>
                  </div>
                )}

                {/* Execution Error */}
                {execError && (
                  <div className="card border-red-500/20 bg-red-500/10">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                      <div>
                        <h3 className="text-sm font-semibold text-red-400">Validation Failed</h3>
                        <p className="mt-1 text-sm text-red-300">{execError}</p>
                      </div>
                    </div>
                    <button
                      onClick={resetExec}
                      className="btn-secondary mt-3 text-sm"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <dl className="space-y-3">
                {/* Score with visual progress bar */}
                <div>
                  <dt className="text-sm text-zinc-500">Score</dt>
                  <dd className="mt-1">
                    <div className="relative h-4 w-full rounded-full bg-white/10">
                      <div
                        className={`h-4 rounded-full ${getScoreColor(validation[1].score)}`}
                        style={{ width: `${validation[1].score}%` }}
                      />
                    </div>
                    <p className={`mt-1 text-center text-2xl font-bold ${getScoreTextColor(validation[1].score)}`}>
                      {validation[1].score}/100
                    </p>
                  </dd>
                </div>
                {validation[1].validator !== '0x0000000000000000000000000000000000000000' && (
                  <div>
                    <dt className="text-sm text-zinc-500">Validator</dt>
                    <dd className="mt-1 font-mono text-sm text-white">
                      {shortenAddress(validation[1].validator)}
                    </dd>
                  </div>
                )}
                {validation[1].timestamp > 0n && (
                  <div>
                    <dt className="text-sm text-zinc-500">Validated At</dt>
                    <dd className="mt-1 text-sm text-white">
                      {new Date(Number(validation[1].timestamp) * 1000).toLocaleString()}
                    </dd>
                  </div>
                )}
                {validation[1].detailsURI && (
                  <div>
                    <dt className="text-sm text-zinc-500">Details URI</dt>
                    <dd className="mt-1">
                      <a
                        href={validation[1].detailsURI}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#38BDF8] hover:underline"
                      >
                        View Details
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* Bounty Distribution (for Completed validations) */}
          {validation[0].status === 1 && validation[0].bounty > 0n && (
            <div className="card">
              <h2 className="mb-4 text-lg font-semibold text-white">
                Bounty Distribution
              </h2>
              {(() => {
                const bounty = validation[0].bounty;
                const protocolFee = bounty * 10n / 100n;
                const remaining = bounty - protocolFee;
                const agentReward = remaining * 10n / 100n;
                const validatorReward = remaining - agentReward;
                return (
                  <dl className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                      <dt className="text-sm text-zinc-400">Protocol Fee (10%)</dt>
                      <dd className="font-mono text-sm font-medium text-white">
                        {formatBigInt(protocolFee)} {nativeCurrency}
                      </dd>
                    </div>
                    <div className="text-xs text-zinc-600 pl-3">Treasury</div>
                    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                      <dt className="text-sm text-zinc-400">Agent Reward (10%)</dt>
                      <dd className="font-mono text-sm font-medium text-white">
                        {formatBigInt(agentReward)} {nativeCurrency}
                      </dd>
                    </div>
                    <div className="text-xs text-zinc-600 pl-3">Agent Owner</div>
                    <div className="flex items-center justify-between rounded-lg bg-[#38BDF8]/10 px-3 py-2">
                      <dt className="text-sm font-medium text-[#38BDF8]">Validator Reward (80%)</dt>
                      <dd className="font-mono text-sm font-bold text-[#38BDF8]">
                        {formatBigInt(validatorReward)} {nativeCurrency}
                      </dd>
                    </div>
                    <div className="text-xs text-zinc-600 pl-3">Validator</div>
                    <div className="mt-2 border-t border-white/10 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">Total Bounty</span>
                        <span className="font-mono text-sm font-bold text-white">
                          {formatBigInt(bounty)} {nativeCurrency}
                        </span>
                      </div>
                    </div>
                  </dl>
                );
              })()}
            </div>
          )}

          {/* Timeline */}
          <div className="card md:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Timeline
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    Validation Requested
                  </p>
                  <p className="text-xs text-zinc-500">
                    Request submitted on-chain
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full ${
                    validation[0].status >= 1 ? 'bg-emerald-500/20' : 'bg-white/10'
                  }`}
                >
                  <Clock
                    className={`h-3.5 w-3.5 ${
                      validation[0].status >= 1 ? 'text-emerald-400' : 'text-zinc-600'
                    }`}
                  />
                </div>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      validation[0].status >= 1 ? 'text-white' : 'text-zinc-500'
                    }`}
                  >
                    {validation[0].status >= 1
                      ? 'Validator Selected'
                      : 'Awaiting Validator'}
                  </p>
                  <p className="text-xs text-zinc-600">
                    DRB selects a validator via commit-reveal
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full ${
                    validation[0].status === 1 ? 'bg-emerald-500/20' : 'bg-white/10'
                  }`}
                >
                  <Shield
                    className={`h-3.5 w-3.5 ${
                      validation[0].status === 1 ? 'text-emerald-400' : 'text-zinc-600'
                    }`}
                  />
                </div>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      validation[0].status === 1 ? 'text-white' : 'text-zinc-500'
                    }`}
                  >
                    {validation[0].status === 1
                      ? 'Validation Complete'
                      : validation[0].status === 2
                        ? 'Validation Expired'
                        : validation[0].status === 3
                          ? 'Validation Disputed'
                          : 'Awaiting Completion'}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {validation[0].status === 1
                      ? 'Result submitted and verified'
                      : validation[0].status === 2
                        ? 'Deadline passed without completion'
                        : validation[0].status === 3
                          ? 'Under dispute review'
                          : 'Pending validator execution'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Section (for Completed validations) */}
      {validation && validation[0].status === 1 && !isDisputed && (
        <div className="mt-6">
          <button
            onClick={() => setShowDisputeForm(!showDisputeForm)}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Dispute this Validation
            {showDisputeForm ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showDisputeForm && (
            <div className="card border-amber-500/20 bg-amber-500/10 mt-4">
              <h3 className="mb-3 text-sm font-semibold text-amber-400">
                Submit Dispute Evidence
              </h3>
              <p className="mb-3 text-xs text-amber-300">
                Provide a detailed description of why this validation result is incorrect.
                Your evidence will be encoded and submitted on-chain.
              </p>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                placeholder="Describe the evidence for your dispute..."
                rows={4}
                className="mt-1 w-full bg-white/5 border-white/10 text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/50 rounded-lg border px-3 py-2 text-sm focus:outline-none"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleDisputeSubmit}
                  disabled={!evidenceText.trim() || isDisputePending || isDisputeConfirming}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  {isDisputePending ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Confirm in Wallet...
                    </>
                  ) : isDisputeConfirming ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Confirming...
                    </>
                  ) : (
                    'Submit Dispute'
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowDisputeForm(false);
                    setEvidenceText('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>

              {/* Dispute Success */}
              {isDisputeSuccess && disputeHash && (
                <div className="card border-emerald-500/20 bg-emerald-500/10 mt-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-400">Dispute Submitted</h4>
                      <p className="mt-1 text-xs text-emerald-300">
                        Your dispute has been submitted on-chain.
                      </p>
                      <a
                        href={`${explorerUrl}/tx/${disputeHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-[#38BDF8] hover:underline"
                      >
                        View transaction
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Dispute Error */}
              {disputeError && (
                <div className="card border-red-500/20 bg-red-500/10 mt-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                    <div>
                      <h4 className="text-sm font-semibold text-red-400">Dispute Failed</h4>
                      <p className="mt-1 text-xs text-red-300">
                        {disputeError.message || 'Transaction failed. Please try again.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Disputed badge for already disputed validations */}
      {validation && isDisputed && (
        <div className="card border-red-500/20 bg-red-500/10 mt-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <div>
              <h3 className="text-sm font-semibold text-red-400">This validation has been disputed</h3>
              <p className="mt-1 text-xs text-red-300">
                A dispute has been filed against this validation result. It is currently under review.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
