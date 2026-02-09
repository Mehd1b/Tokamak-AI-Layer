'use client';

import { useState, useEffect } from 'react';
import { Send, Loader2, AlertCircle, CheckCircle, FileCode, FileText, Shield, CheckCircle2, XCircle, Coins } from 'lucide-react';
import { useSubmitTask } from '@/hooks/useAgentRuntime';
import { useRequestValidation } from '@/hooks/useValidation';
import { usePayForTask, useTONBalanceL2, generateTaskRef } from '@/hooks/useTaskFee';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';

interface TaskSubmissionProps {
  agentId: string;
  agentName: string;
  placeholder: string;
  onChainAgentId?: bigint;
  feePerTask?: bigint;
}

type PaymentStep = 'input' | 'paying' | 'paid' | 'submitting';

export function TaskSubmission({ agentId, agentName, placeholder, onChainAgentId, feePerTask }: TaskSubmissionProps) {
  const [input, setInput] = useState('');
  const [nonce] = useState(() => BigInt(Date.now()));
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('input');
  const [currentTaskRef, setCurrentTaskRef] = useState<`0x${string}` | undefined>();

  const { address } = useAccount();
  const { data: balance } = useTONBalanceL2(address);
  const { submitTask, result, isSubmitting, error, reset } = useSubmitTask();
  const { pay, hash: payHash, isPending: isPayPending, isConfirming: isPayConfirming, isSuccess: isPaySuccess, error: payError } = usePayForTask();
  const {
    validate,
    result: validationResult,
    isValidating,
    error: validationError,
    reset: resetValidation,
  } = useRequestValidation();

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
      submitTask(agentId, input, payHash, currentTaskRef);
    }
  }, [paymentStep, input, isSubmitting, result, agentId, payHash, currentTaskRef, submitTask]);

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
      await submitTask(agentId, input);
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
        <div className="flex items-center justify-between rounded-lg border border-tokamak-200 bg-tokamak-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-tokamak-600" />
            <span className="text-sm font-medium text-tokamak-800">
              Fee: {formatEther(feePerTask)} TON per task
            </span>
          </div>
          {balance && (
            <span className={`text-xs ${insufficientBalance ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Balance: {parseFloat(formatEther(balance.value)).toFixed(4)} TON
              {insufficientBalance && ' (insufficient)'}
            </span>
          )}
        </div>
      )}

      {/* Step Indicator (only for paid agents during payment) */}
      {hasFee && paymentStep !== 'input' && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`flex items-center gap-1 ${paymentStep === 'paying' ? 'text-tokamak-600 font-medium' : isPaySuccess ? 'text-green-600' : 'text-gray-400'}`}>
            {isPaySuccess ? <CheckCircle className="h-3 w-3" /> : <span className="flex h-3 w-3 items-center justify-center rounded-full border text-[10px]">1</span>}
            Pay Fee
          </span>
          <span className="text-gray-300">→</span>
          <span className={`flex items-center gap-1 ${paymentStep === 'submitting' || paymentStep === 'paid' ? 'text-tokamak-600 font-medium' : 'text-gray-400'}`}>
            {result ? <CheckCircle className="h-3 w-3 text-green-600" /> : <span className="flex h-3 w-3 items-center justify-center rounded-full border text-[10px]">2</span>}
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
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-mono focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500 disabled:bg-gray-50 disabled:text-gray-500 resize-y"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
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
                  Paying {hasFee ? formatEther(feePerTask) + ' TON' : ''}...
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800">Payment Failed</p>
              <p className="mt-1 text-sm text-red-700">{payError.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Task Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800">Task Failed</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && result.status === 'completed' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                Task Completed
              </span>
            </div>
            <span className="text-xs text-green-600 font-mono">
              {result.taskId.slice(0, 8)}...
            </span>
          </div>

          {/* Payment confirmation */}
          {payHash && (
            <div className="mb-3 rounded bg-green-100/50 px-2 py-1">
              <p className="text-xs text-green-700">Payment Tx</p>
              <a
                href={`https://explorer.thanos-sepolia.tokamak.network/tx/${payHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-xs font-mono text-green-900 underline"
              >
                {payHash.slice(0, 18)}...
              </a>
            </div>
          )}

          {/* Hashes for on-chain verification */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded bg-green-100/50 px-2 py-1">
              <p className="text-xs text-green-700">Input Hash</p>
              <p className="truncate text-xs font-mono text-green-900">
                {result.inputHash}
              </p>
            </div>
            <div className="rounded bg-green-100/50 px-2 py-1">
              <p className="text-xs text-green-700">Output Hash</p>
              <p className="truncate text-xs font-mono text-green-900">
                {result.outputHash}
              </p>
            </div>
          </div>

          {/* Output */}
          <div className="rounded-lg border border-green-200 bg-white p-4">
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                {result.output}
              </pre>
            </div>
          </div>

          {/* Validation */}
          <div className="mt-4 border-t border-green-200 pt-4">
            {!validationResult && !validationError && (
              <button
                onClick={() => validate(agentId, result.taskId)}
                disabled={isValidating}
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                {isValidating ? (
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

            {validationResult && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  {validationResult.score >= 90 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : validationResult.score < 50 ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Shield className="h-4 w-4 text-blue-600" />
                  )}
                  <span className="text-sm font-medium text-blue-800">
                    Validation Complete
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-blue-600">Score:</span>{' '}
                    <span className="font-mono font-bold text-blue-900">
                      {validationResult.score}/100
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-600">Match:</span>{' '}
                    <span className="font-mono text-blue-900 capitalize">
                      {validationResult.matchType}
                    </span>
                  </div>
                </div>
                {validationResult.reExecutionHash && (
                  <div className="mt-1 text-xs">
                    <span className="text-blue-600">Re-execution Hash:</span>{' '}
                    <span className="font-mono text-blue-900">
                      {validationResult.reExecutionHash.substring(0, 18)}...
                    </span>
                  </div>
                )}
              </div>
            )}

            {validationError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{validationError}</p>
                <button
                  onClick={resetValidation}
                  className="mt-2 text-xs text-red-600 underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {result && result.status === 'failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800">Agent Error</p>
              <p className="mt-1 text-sm text-red-700">{result.error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
