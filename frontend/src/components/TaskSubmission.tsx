'use client';

import { useState, useEffect } from 'react';
import { Send, Loader2, AlertCircle, CheckCircle, FileCode, FileText, Shield, CheckCircle2, XCircle, Coins, Download } from 'lucide-react';
import { useSubmitTask } from '@/hooks/useAgentRuntime';
import { useRequestValidation, useRequestValidationOnChain } from '@/hooks/useValidation';
import { StrategyReportView, isStrategyReport } from './StrategyReportView';
import { usePayForTask, useTONBalanceL2, generateTaskRef, useRefundTask } from '@/hooks/useTaskFee';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { useL2Config } from '@/hooks/useL2Config';

/** Detect trading strategy output (from trading-agent) */
function isTradingStrategy(obj: unknown): obj is { strategy: { id: string; analysis: unknown; trades: unknown[] }; unsignedSwaps?: unknown[] } {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  if (!o.strategy || typeof o.strategy !== 'object') return false;
  const s = o.strategy as Record<string, unknown>;
  return typeof s.id === 'string' && !!s.analysis && Array.isArray(s.trades);
}

/** Download a zip file from a URL */
async function downloadZip(strategyId: string, agentBaseUrl: string) {
  const url = `${agentBaseUrl}/api/v1/trade/${strategyId}/download`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `trading-bot-${strategyId}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

function TradingStrategyView({ data, serviceUrl }: { data: { strategy: { id: string; analysis: { marketCondition: string; confidence: number; reasoning: string }; trades: Array<{ action: string; tokenIn: string; tokenOut: string; amountIn: string; poolFee: number; priceImpact: number }>; estimatedReturn?: { optimistic: number; expected: number; pessimistic: number } }; riskWarnings?: string[]; unsignedSwaps?: unknown[] }; serviceUrl?: string }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { strategy, riskWarnings } = data;

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      // Derive the agent base URL from the A2A service URL origin
      let agentBaseUrl = '';
      if (serviceUrl) {
        try { agentBaseUrl = new URL(serviceUrl).origin; } catch { /* invalid URL */ }
      }
      if (!agentBaseUrl) {
        throw new Error('Agent service URL not available. Cannot download bot package.');
      }
      await downloadZip(strategy.id, agentBaseUrl);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Market Analysis */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          strategy.analysis.marketCondition === 'bullish'
            ? 'bg-emerald-500/20 text-emerald-400'
            : strategy.analysis.marketCondition === 'bearish'
            ? 'bg-red-500/20 text-red-400'
            : 'bg-amber-500/20 text-amber-400'
        }`}>
          {strategy.analysis.marketCondition.toUpperCase()}
        </span>
        <span className="text-sm text-zinc-400">
          Confidence: <span className="font-mono text-white">{strategy.analysis.confidence}%</span>
        </span>
      </div>
      <p className="text-sm text-zinc-300">{strategy.analysis.reasoning}</p>

      {/* Trades */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Trades ({strategy.trades.length})</p>
        {strategy.trades.map((t, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${t.action === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                {t.action.toUpperCase()}
              </span>
              <span className="text-xs font-mono text-zinc-300">{t.tokenIn.slice(0, 6)}...{t.tokenIn.slice(-4)}</span>
              <span className="text-zinc-600">&rarr;</span>
              <span className="text-xs font-mono text-zinc-300">{t.tokenOut.slice(0, 6)}...{t.tokenOut.slice(-4)}</span>
            </div>
            <div className="text-right text-xs">
              <span className="text-zinc-400">Fee: {t.poolFee / 10000}%</span>
              {t.priceImpact > 0 && (
                <span className="ml-2 text-amber-400">Impact: {t.priceImpact.toFixed(2)}%</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Expected Returns */}
      {strategy.estimatedReturn && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <p className="text-[10px] text-zinc-500">Pessimistic</p>
            <p className="text-sm font-mono text-red-400">{strategy.estimatedReturn.pessimistic}%</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <p className="text-[10px] text-zinc-500">Expected</p>
            <p className="text-sm font-mono text-[#38BDF8]">{strategy.estimatedReturn.expected}%</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <p className="text-[10px] text-zinc-500">Optimistic</p>
            <p className="text-sm font-mono text-emerald-400">{strategy.estimatedReturn.optimistic}%</p>
          </div>
        </div>
      )}

      {/* Risk Warnings */}
      {riskWarnings && riskWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2">
          <p className="text-xs font-medium text-amber-400 mb-1">Risk Warnings</p>
          {riskWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-300">- {w}</p>
          ))}
        </div>
      )}

      {/* Download Bot Button */}
      <div className="flex items-center gap-3 pt-2 border-t border-white/10">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="btn-primary inline-flex items-center gap-2 text-sm"
        >
          {downloading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating Bot...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download Trading Bot (.zip)
            </>
          )}
        </button>
        <span className="text-xs text-zinc-500">Self-contained Node.js bot for this strategy</span>
      </div>
      {downloadError && (
        <p className="text-xs text-red-400">{downloadError}</p>
      )}

      {/* Raw JSON toggle */}
      <details className="mt-2">
        <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">View raw JSON</summary>
        <pre className="mt-1 whitespace-pre-wrap text-xs text-zinc-400 font-mono leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function FormattedOutput({ output, serviceUrl }: { output: string | null; serviceUrl?: string }) {
  if (!output) return <p className="text-sm text-zinc-500">No output</p>;

  // Try to parse as JSON and check if it's a strategy report
  try {
    const parsed = JSON.parse(output);

    // Check for trading strategy first
    if (isTradingStrategy(parsed)) {
      return <TradingStrategyView data={parsed as Parameters<typeof TradingStrategyView>[0]['data']} serviceUrl={serviceUrl} />;
    }

    if (isStrategyReport(parsed)) {
      return <StrategyReportView report={parsed} />;
    }
    // Valid JSON but not a strategy report — pretty-print it
    return (
      <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-mono leading-relaxed">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    // Not JSON — render as plain text
    return (
      <div className="prose prose-sm max-w-none prose-invert">
        <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-sans leading-relaxed">
          {output}
        </pre>
      </div>
    );
  }
}

interface TaskSubmissionProps {
  agentId: string;
  agentName: string;
  placeholder: string;
  onChainAgentId?: bigint;
  feePerTask?: bigint;
  serviceUrl?: string;
}

type PaymentStep = 'input' | 'paying' | 'paid' | 'submitting';

export function TaskSubmission({ agentId, agentName, placeholder, onChainAgentId, feePerTask, serviceUrl }: TaskSubmissionProps) {
  const [input, setInput] = useState('');
  const [nonce] = useState(() => BigInt(Date.now()));
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('input');
  const [currentTaskRef, setCurrentTaskRef] = useState<`0x${string}` | undefined>();

  const { address } = useAccount();
  const { explorerUrl, nativeCurrency } = useL2Config();
  const { data: balance } = useTONBalanceL2(address);
  const { submitTask, result, isSubmitting, error, reset } = useSubmitTask();
  const { pay, hash: payHash_, isPending: isPayPending, isConfirming: isPayConfirming, isSuccess: isPaySuccess, error: payError } = usePayForTask();
  const payHash = payHash_ as `0x${string}` | undefined;
  const {
    validate,
    result: validationResult,
    isValidating,
    error: validationError,
    reset: resetValidation,
  } = useRequestValidation();
  const {
    requestValidation: requestValidationOnChain,
    isPending: isOnChainPending,
    isConfirming: isOnChainConfirming,
    isSuccess: isOnChainSuccess,
    requestHash: onChainRequestHash,
    error: onChainError,
    hash: onChainTxHash,
  } = useRequestValidationOnChain();
  const {
    refund,
    hash: refundHash,
    isPending: isRefundPending,
    isConfirming: isRefundConfirming,
    isSuccess: isRefundSuccess,
    error: refundError,
  } = useRefundTask();

  const hasFee = feePerTask && feePerTask > 0n && onChainAgentId !== undefined;
  const insufficientBalance = hasFee && balance && balance.value < feePerTask;

  // When payment confirms, move to paid step and submit task
  useEffect(() => {
    if (isPaySuccess && paymentStep === 'paying') {
      setPaymentStep('paid');
    }
  }, [isPaySuccess, paymentStep]);

  // Auto-submit after payment success
  useEffect(() => {
    if (paymentStep === 'paid' && input.trim() && !isSubmitting && !result) {
      setPaymentStep('submitting');
      submitTask(agentId, input, payHash, currentTaskRef, serviceUrl);
    }
  }, [paymentStep, input, isSubmitting, result, agentId, payHash, currentTaskRef, submitTask, serviceUrl]);

  // Auto-trigger off-chain validation after on-chain requestValidation confirms
  useEffect(() => {
    if (isOnChainSuccess && onChainRequestHash && result?.taskId && !isValidating && !validationResult) {
      validate(agentId, result.taskId, onChainRequestHash);
    }
  }, [isOnChainSuccess, onChainRequestHash, result, agentId, isValidating, validationResult, validate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSubmitting) return;

    if (hasFee && address) {
      // Generate taskRef and start payment flow
      const taskRef = generateTaskRef(onChainAgentId, address, nonce);
      setCurrentTaskRef(taskRef);
      setPaymentStep('paying');
      pay(onChainAgentId, taskRef, feePerTask);
    } else {
      // Free agent - submit directly
      setPaymentStep('submitting');
      await submitTask(agentId, input, undefined, undefined, serviceUrl);
    }
  };

  const handleReset = () => {
    reset();
    resetValidation();
    setInput('');
    setPaymentStep('input');
    setCurrentTaskRef(undefined);
  };

  const isProcessing = isSubmitting || isPayPending || isPayConfirming;

  return (
    <div className="space-y-4">
      {/* Fee Info Banner */}
      {hasFee && (
        <div className="flex items-center justify-between rounded-lg border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-[#38BDF8]" />
            <span className="text-sm font-medium text-[#38BDF8]">
              Fee: {formatEther(feePerTask)} {nativeCurrency} per task
            </span>
          </div>
          {balance && (
            <span className={`text-xs ${insufficientBalance ? 'text-red-400 font-medium' : 'text-zinc-500'}`}>
              Balance: {parseFloat(formatEther(balance.value)).toFixed(4)} {nativeCurrency}
              {insufficientBalance && ' (insufficient)'}
            </span>
          )}
        </div>
      )}

      {/* Step Indicator (only for paid agents during payment) */}
      {hasFee && paymentStep !== 'input' && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`flex items-center gap-1 ${paymentStep === 'paying' ? 'text-[#38BDF8] font-medium' : isPaySuccess ? 'text-emerald-400' : 'text-zinc-600'}`}>
            {isPaySuccess ? <CheckCircle className="h-3 w-3" /> : <span className="flex h-3 w-3 items-center justify-center rounded-full border border-white/20 text-[10px]">1</span>}
            Pay Fee
          </span>
          <span className="text-zinc-600">&rarr;</span>
          <span className={`flex items-center gap-1 ${paymentStep === 'submitting' || paymentStep === 'paid' ? 'text-[#38BDF8] font-medium' : 'text-zinc-600'}`}>
            {result ? <CheckCircle className="h-3 w-3 text-emerald-400" /> : <span className="flex h-3 w-3 items-center justify-center rounded-full border border-white/20 text-[10px]">2</span>}
            Submit Task
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={8}
          disabled={isProcessing}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-mono text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50 disabled:bg-white/[0.02] disabled:text-zinc-600 resize-y"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            {input.length > 0 ? `${input.length} characters` : `Paste your input above`}
          </p>
          <div className="flex gap-2">
            {result && (
              <button
                type="button"
                onClick={handleReset}
                className="btn-secondary text-sm"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || isProcessing || !!insufficientBalance}
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              {isPayPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirm Payment...
                </>
              ) : isPayConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Paying {hasFee ? formatEther(feePerTask) + ' ' + nativeCurrency : ''}...
                </>
              ) : isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {hasFee ? `Pay & Submit to ${agentName}` : `Submit to ${agentName}`}
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Payment Error */}
      {payError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-400">Payment Failed</p>
              <p className="mt-1 text-sm text-red-400/80">{payError.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Task Error */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-400">Task Failed</p>
              <p className="mt-1 text-sm text-red-400/80">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && result.status === 'completed' && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">
                Task Completed
              </span>
            </div>
            <span className="text-xs text-emerald-400 font-mono">
              {result.taskId.slice(0, 8)}...
            </span>
          </div>

          {/* Payment confirmation */}
          {payHash ? (
            <div className="mb-3 rounded bg-white/5 px-2 py-1">
              <p className="text-xs text-zinc-400">Payment Tx</p>
              <a
                href={`${explorerUrl}/tx/${payHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-xs font-mono text-zinc-300 underline"
              >
                {payHash.slice(0, 18)}...
              </a>
            </div>
          ) : null}

          {/* Fee escrow status */}
          {hasFee && currentTaskRef && result?.metadata?.feeConfirmed && (
            <div className="mb-3 rounded bg-white/5 px-2 py-1">
              <p className="text-xs text-zinc-400">Fee Escrow</p>
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Fees released to agent
                {result.metadata.confirmTxHash && (
                  <a
                    href={`${explorerUrl}/tx/${result.metadata.confirmTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 font-mono underline"
                  >
                    {String(result.metadata.confirmTxHash).slice(0, 14)}...
                  </a>
                )}
              </p>
            </div>
          )}

          {/* Hashes for on-chain verification */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded bg-white/5 px-2 py-1">
              <p className="text-xs text-zinc-400">Input Hash</p>
              <p className="truncate text-xs font-mono text-zinc-300">
                {result.inputHash}
              </p>
            </div>
            <div className="rounded bg-white/5 px-2 py-1">
              <p className="text-xs text-zinc-400">Output Hash</p>
              <p className="truncate text-xs font-mono text-zinc-300">
                {result.outputHash}
              </p>
            </div>
          </div>

          {/* Output */}
          <div className="rounded-lg border border-white/10 bg-[#0d0d12] p-4">
            <FormattedOutput output={result.output} serviceUrl={serviceUrl} />
          </div>

          {/* Validation */}
          <div className="mt-4 border-t border-emerald-500/20 pt-4">
            {!validationResult && !validationError && (
              <button
                onClick={() => {
                  if (!onChainAgentId || !result?.inputHash || !result?.outputHash) return;
                  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
                  requestValidationOnChain({
                    agentId: onChainAgentId,
                    taskHash: result.inputHash as `0x${string}`,
                    outputHash: result.outputHash as `0x${string}`,
                    model: 0, // ReputationOnly
                    deadline,
                    bountyWei: 0n,
                  });
                }}
                disabled={isOnChainPending || isOnChainConfirming || isValidating || !onChainAgentId}
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                {isOnChainPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirm Validation Request...
                  </>
                ) : isOnChainConfirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting On-Chain...
                  </>
                ) : isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Request Validation
                  </>
                )}
              </button>
            )}

            {onChainError && !validationResult && (
              <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-sm text-red-400">On-chain request failed: {onChainError.message}</p>
              </div>
            )}

            {validationResult && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <div className="mb-2 flex items-center gap-2">
                  {validationResult.score >= 90 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : validationResult.score < 50 ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <Shield className="h-4 w-4 text-blue-400" />
                  )}
                  <span className="text-sm font-medium text-blue-400">
                    Validation Complete
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-blue-400/70">Score:</span>{' '}
                    <span className="font-mono font-bold text-blue-400">
                      {validationResult.score}/100
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-400/70">Match:</span>{' '}
                    <span className="font-mono text-blue-400 capitalize">
                      {validationResult.matchType}
                    </span>
                  </div>
                </div>
                {validationResult.reExecutionHash && (
                  <div className="mt-1 text-xs">
                    <span className="text-blue-400/70">Re-execution Hash:</span>{' '}
                    <span className="font-mono text-blue-400">
                      {validationResult.reExecutionHash.substring(0, 18)}...
                    </span>
                  </div>
                )}
                {(validationResult.txHash || onChainTxHash) && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {(validationResult.txHash || onChainTxHash) && (
                      <a
                        href={`${explorerUrl}/tx/${validationResult.txHash || onChainTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-blue-400 underline"
                      >
                        View tx on explorer
                      </a>
                    )}
                    {(validationResult.requestHash || onChainRequestHash) && (
                      <a
                        href={`/validation/${validationResult.requestHash || onChainRequestHash}`}
                        className="font-mono text-blue-400 underline"
                      >
                        View on-chain validation details
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {validationError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-sm text-red-400">{validationError}</p>
                <button
                  onClick={resetValidation}
                  className="mt-2 text-xs text-red-400 underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {result && result.status === 'failed' && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">Agent Error</p>
              <p className="mt-1 text-sm text-red-400/80">{result.error}</p>

              {/* Refund UI for paid tasks that failed */}
              {payHash && currentTaskRef && (
                <div className="mt-3 border-t border-red-500/20 pt-3">
                  {isRefundSuccess ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm text-emerald-400">Refund confirmed</span>
                      {refundHash && (
                        <a
                          href={`${explorerUrl}/tx/${refundHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-emerald-400/80 underline"
                        >
                          {refundHash.slice(0, 14)}...
                        </a>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-zinc-400 mb-2">
                        Your payment will be refunded automatically. If not, you can claim it after 1 hour.
                      </p>
                      <button
                        type="button"
                        onClick={() => refund(currentTaskRef)}
                        disabled={isRefundPending || isRefundConfirming}
                        className="btn-secondary inline-flex items-center gap-2 text-sm"
                      >
                        {isRefundPending ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Confirm Refund...
                          </>
                        ) : isRefundConfirming ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Refunding...
                          </>
                        ) : (
                          <>
                            <Coins className="h-3 w-3" />
                            Claim Refund
                          </>
                        )}
                      </button>
                      {refundError && (
                        <p className="mt-2 text-xs text-red-400">{refundError.message}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
