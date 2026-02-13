'use client';

import { useState, useEffect, useCallback } from 'react';
import { keccak256, toHex } from 'viem';

/** Extract a plain-text error string from an A2A status message (which is {role, parts}) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractA2AErrorText(message: any): string {
  if (!message) return 'Task failed';
  if (typeof message === 'string') return message;
  // A2A message: { role: string, parts: [{type: "text", text: "..."}, ...] }
  if (Array.isArray(message.parts)) {
    const text = message.parts
      .filter((p: { type: string }) => p.type === 'text')
      .map((p: { text: string }) => p.text)
      .join('\n');
    if (text) return text;
  }
  return 'Task failed';
}

export interface RuntimeAgent {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities: Array<{
    id: string;
    name: string;
    description: string;
    inputSchema?: object;
    outputSchema?: object;
  }>;
  status: string;
  endpoint: string;
  onChainId?: string;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  input: { text: string; options?: Record<string, unknown> };
  output: string | null;
  outputHash: string | null;
  inputHash: string | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
}

export function useRuntimeAgent(onChainAgentId: string | undefined) {
  const [agent, setAgent] = useState<RuntimeAgent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Reset state immediately so stale data from the previous agent is never shown
    setAgent(null);
    setIsLoading(true);

    if (!onChainAgentId) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/runtime/${onChainAgentId}/info`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setAgent(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [onChainAgentId]);

  return { agent, isLoading };
}

export function useSubmitTask() {
  const [result, setResult] = useState<TaskResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTask = useCallback(
    async (
      onChainAgentId: string,
      text: string,
      paymentTxHash?: string,
      taskRef?: string,
      serviceUrl?: string,
    ) => {
      setIsSubmitting(true);
      setError(null);
      setResult(null);

      try {
        let data: TaskResult;

        if (serviceUrl && !paymentTxHash) {
          // Direct A2A JSON-RPC 2.0 submission (free tasks only).
          // Paid tasks always go through the proxy so the server can call confirmTask.
          const rpcId = crypto.randomUUID();
          const a2aRequest = {
            jsonrpc: '2.0',
            id: rpcId,
            method: 'tasks/send',
            params: {
              message: {
                role: 'user',
                parts: [{ type: 'text', text }],
              },
              ...(paymentTxHash ? { metadata: { paymentTxHash, taskRef } } : {}),
            },
          };

          const res = await fetch(serviceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(a2aRequest),
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(errBody.error?.message || errBody.error || `Request failed: ${res.status}`);
          }

          const rpcResponse = await res.json();
          if (rpcResponse.error) {
            throw new Error(rpcResponse.error.message || 'A2A request failed');
          }

          // Extract output from A2A task result
          const a2aTask = rpcResponse.result;
          let output = '';
          if (a2aTask?.artifacts?.length) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dataParts = a2aTask.artifacts.flatMap((a: any) => a.parts || []).filter((p: any) => p.type === 'data').map((p: any) => p.data);
            output = dataParts.length === 1 ? JSON.stringify(dataParts[0]) : JSON.stringify(dataParts);
          } else if (a2aTask?.messages?.length) {
            const lastMsg = a2aTask.messages[a2aTask.messages.length - 1];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const textParts = (lastMsg?.parts || []).filter((p: any) => p.type === 'text').map((p: any) => p.text);
            output = textParts.join('\n');
          } else {
            output = JSON.stringify(rpcResponse);
          }

          data = {
            taskId: a2aTask?.id || rpcId,
            agentId: onChainAgentId,
            status: a2aTask?.status?.state === 'failed' ? 'failed' as const : 'completed' as const,
            input: { text },
            output,
            outputHash: output ? keccak256(toHex(output)) : null,
            inputHash: keccak256(toHex(text)),
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            error: a2aTask?.status?.state === 'failed' ? extractA2AErrorText(a2aTask?.status?.message) : null,
            metadata: a2aTask?.metadata || {},
          };
        } else {
          // Proxy submission via Next.js API route
          const res = await fetch(`/api/runtime/${onChainAgentId}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { text }, paymentTxHash, taskRef }),
          });

          if (!res.ok) {
            const errBody = await res.json();
            throw new Error(errBody.error || `Request failed: ${res.status}`);
          }

          data = (await res.json()) as TaskResult;
        }

        setResult(data);
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { submitTask, result, isSubmitting, error, reset };
}

export function useRecentTasks(onChainAgentId?: string) {
  const [tasks, setTasks] = useState<TaskResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!onChainAgentId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetch(`/api/runtime/${onChainAgentId}/tasks`)
      .then((res) => res.json())
      .then((data) => {
        setTasks(data.tasks || []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [onChainAgentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tasks, isLoading, refresh };
}
