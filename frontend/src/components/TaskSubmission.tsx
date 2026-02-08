'use client';

import { useState } from 'react';
import { Send, Loader2, AlertCircle, CheckCircle, FileCode, FileText } from 'lucide-react';
import { useSubmitTask } from '@/hooks/useAgentRuntime';

interface TaskSubmissionProps {
  agentId: string;
  agentName: string;
  placeholder: string;
}

export function TaskSubmission({ agentId, agentName, placeholder }: TaskSubmissionProps) {
  const [input, setInput] = useState('');
  const { submitTask, result, isSubmitting, error, reset } = useSubmitTask();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSubmitting) return;
    await submitTask(agentId, input);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={8}
          disabled={isSubmitting}
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
                onClick={() => { reset(); setInput(''); }}
                className="btn-secondary text-sm"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || isSubmitting}
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit to {agentName}
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Error */}
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
