'use client';

import { useState, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type RiskTolerance = 'low' | 'medium' | 'high';

export interface IntentPreferences {
  asset: string;
  chainId: number;
  targetApy: number;
  maxDrawdown: number;
  riskTolerance: RiskTolerance;
  strategyPreference: string[];
  minTvl: number;
}

export interface VaultMatch {
  vaultAddress: string;
  chainId: number;
  score: number;
  estimatedApy: number;
  maxDrawdown: number;
  tvl: number;
  agentId: string;
  reasons: string[];
}

export interface IntentMatchResult {
  matches: VaultMatch[];
  totalVaultsScanned: number;
}

const DEFAULT_PREFERENCES: IntentPreferences = {
  asset: 'any',
  chainId: 0,
  targetApy: 15,
  maxDrawdown: 10,
  riskTolerance: 'medium',
  strategyPreference: ['any'],
  minTvl: 0,
};

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useIntentMatch() {
  const [step, setStep] = useState(1);
  const [preferences, setPreferences] = useState<IntentPreferences>(DEFAULT_PREFERENCES);
  const [matches, setMatches] = useState<VaultMatch[]>([]);
  const [totalVaultsScanned, setTotalVaultsScanned] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePreference = useCallback(
    <K extends keyof IntentPreferences>(key: K, value: IntentPreferences[K]) => {
      setPreferences((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const search = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setMatches([]);
    setTotalVaultsScanned(0);

    try {
      const response = await fetch('/api/intents/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const data: IntentMatchResult = await response.json();
      setMatches(data.matches);
      setTotalVaultsScanned(data.totalVaultsScanned);
      setStep(5); // Move to results step
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [preferences]);

  const reset = useCallback(() => {
    setStep(1);
    setPreferences(DEFAULT_PREFERENCES);
    setMatches([]);
    setTotalVaultsScanned(0);
    setError(null);
  }, []);

  return {
    step,
    setStep,
    preferences,
    updatePreference,
    matches,
    totalVaultsScanned,
    isLoading,
    error,
    search,
    reset,
  };
}
