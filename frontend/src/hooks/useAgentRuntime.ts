'use client';

import { useState, useEffect, useCallback } from 'react';

const RUNTIME_URL =
  process.env.NEXT_PUBLIC_AGENT_RUNTIME_URL || 'http://localhost:3001';

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

export function useRuntimeAgents() {
  const [agents, setAgents] = useState<RuntimeAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${RUNTIME_URL}/api/agents`)
      .then((res) => res.json())
      .then((data) => {
        setAgents(data.agents || []);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  return { agents, isLoading, error };
}

export function useRuntimeAgent(agentId: string | undefined) {
  const [agent, setAgent] = useState<RuntimeAgent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!agentId) {
      setIsLoading(false);
      return;
    }
    fetch(`${RUNTIME_URL}/api/agents/${agentId}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        setAgent(data);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [agentId]);

  return { agent, isLoading };
}

export function useSubmitTask() {
  const [result, setResult] = useState<TaskResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTask = useCallback(
    async (agentId: string, text: string) => {
      setIsSubmitting(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch(`${RUNTIME_URL}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, input: { text } }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Request failed: ${res.status}`);
        }

        const data = (await res.json()) as TaskResult;
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

export function useRecentTasks() {
  const [tasks, setTasks] = useState<TaskResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setIsLoading(true);
    fetch(`${RUNTIME_URL}/api/tasks`)
      .then((res) => res.json())
      .then((data) => {
        setTasks(data.tasks || []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tasks, isLoading, refresh };
}
