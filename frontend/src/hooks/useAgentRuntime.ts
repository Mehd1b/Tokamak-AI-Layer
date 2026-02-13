'use client';

import { useState, useEffect, useCallback } from 'react';

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

        if (serviceUrl) {
          // Direct submission to the agent's A2A service endpoint
          const res = await fetch(serviceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { text }, paymentTxHash, taskRef }),
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(errBody.error || `Request failed: ${res.status}`);
          }

          const raw = await res.json();
          // Normalize: agent may return a TaskResult or a raw response
          data = raw.taskId ? raw : {
            taskId: raw.strategy?.id || raw.id || crypto.randomUUID(),
            agentId: onChainAgentId,
            status: 'completed' as const,
            input: { text },
            output: JSON.stringify(raw),
            outputHash: null,
            inputHash: null,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            error: null,
            metadata: {},
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
