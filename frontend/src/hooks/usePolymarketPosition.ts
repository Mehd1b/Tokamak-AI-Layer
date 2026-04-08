'use client';

import { useQuery } from '@tanstack/react-query';

const POLYMARKET_DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

// ─── Types ───────────────────────────────────────────────────────────

export interface PolymarketPosition {
  /** Conditional token asset ID */
  asset: string;
  /** Condition ID (market identifier) */
  conditionId: string;
  /** Outcome: "Yes" or "No" */
  outcome: string;
  /** Number of outcome shares held */
  size: number;
  /** Average entry price (0–1 range) */
  avgPrice: number;
  /** Current market price (0–1 range) */
  curPrice: number;
  /** Current value in USDC */
  currentValue: number;
  /** Unrealized PnL in USDC */
  pnl: number;
  /** Percentage return */
  pnlPercent: number;
  /** Whether the market has resolved */
  resolved: boolean;
  /** Market question/title (enriched from Gamma API) */
  title: string;
}

export interface PolymarketPortfolio {
  /** All positions (active + resolved) */
  positions: PolymarketPosition[];
  /** Total portfolio value in USDC */
  totalValue: number;
  /** Total unrealized PnL */
  totalPnl: number;
  /** Number of active (unresolved) markets */
  activeMarkets: number;
  /** Number of resolved markets */
  resolvedMarkets: number;
}

interface RawPosition {
  asset: string;
  conditionId: string;
  outcome: string;
  size: string;
  avgPrice: string;
  curPrice: string;
  currentValue: string;
  cashPnl: string;
  percentPnl: string;
  resolved: boolean;
  title?: string;
  market?: string;
  question?: string;
}

interface GammaMarket {
  conditionId: string;
  question: string;
  slug: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  liquidity: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────

/**
 * Fetch live Polymarket positions for a vault address.
 * Uses the Polymarket data API with Gamma market enrichment.
 */
export function usePolymarketPositions(vaultAddress: `0x${string}` | undefined) {
  return useQuery<PolymarketPortfolio | null>({
    queryKey: ['polymarketPositions', vaultAddress],
    queryFn: async () => {
      if (!vaultAddress) return null;

      const addr = vaultAddress.toLowerCase();

      // Fetch positions from Polymarket data API
      const posResponse = await fetch(`${POLYMARKET_DATA_API}/positions?user=${addr}`);
      if (!posResponse.ok) return null;

      const rawPositions: RawPosition[] = await posResponse.json();
      if (!rawPositions || rawPositions.length === 0) {
        return {
          positions: [],
          totalValue: 0,
          totalPnl: 0,
          activeMarkets: 0,
          resolvedMarkets: 0,
        };
      }

      // Collect unique condition IDs for market metadata enrichment
      const conditionIds = [...new Set(rawPositions.map((p) => p.conditionId))];

      // Fetch market metadata from Gamma API (batch by condition IDs)
      let marketMap = new Map<string, GammaMarket>();
      try {
        // Gamma API supports filtering by condition_id
        const marketResponses = await Promise.all(
          // Batch in groups of 20 to avoid URL length limits
          chunk(conditionIds, 20).map(async (batch) => {
            const ids = batch.join(',');
            const res = await fetch(`${GAMMA_API}/markets?condition_ids=${ids}&limit=100`);
            if (!res.ok) return [];
            return res.json() as Promise<GammaMarket[]>;
          })
        );
        for (const markets of marketResponses) {
          for (const m of markets) {
            marketMap.set(m.conditionId, m);
          }
        }
      } catch {
        // Market enrichment is optional — positions still work without titles
      }

      // Map raw positions to typed positions
      const positions: PolymarketPosition[] = rawPositions
        .filter((p) => parseFloat(p.size) > 0.001) // filter dust
        .map((p) => {
          const market = marketMap.get(p.conditionId);
          return {
            asset: p.asset,
            conditionId: p.conditionId,
            outcome: p.outcome || 'Yes',
            size: parseFloat(p.size) || 0,
            avgPrice: parseFloat(p.avgPrice) || 0,
            curPrice: parseFloat(p.curPrice) || 0,
            currentValue: parseFloat(p.currentValue) || 0,
            pnl: parseFloat(p.cashPnl) || 0,
            pnlPercent: parseFloat(p.percentPnl) || 0,
            resolved: p.resolved ?? false,
            title: p.title || p.question || p.market || market?.question || truncateId(p.conditionId),
          };
        });

      const activePositions = positions.filter((p) => !p.resolved);
      const resolvedPositions = positions.filter((p) => p.resolved);

      return {
        positions,
        totalValue: positions.reduce((sum, p) => sum + p.currentValue, 0),
        totalPnl: positions.reduce((sum, p) => sum + p.pnl, 0),
        activeMarkets: new Set(activePositions.map((p) => p.conditionId)).size,
        resolvedMarkets: new Set(resolvedPositions.map((p) => p.conditionId)).size,
      };
    },
    enabled: !!vaultAddress,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

/**
 * Fetch market metadata from Gamma API for a list of condition IDs.
 */
export function usePolymarketMarkets(conditionIds: string[]) {
  return useQuery<GammaMarket[]>({
    queryKey: ['polymarketMarkets', conditionIds],
    queryFn: async () => {
      if (conditionIds.length === 0) return [];

      const batches = chunk(conditionIds, 20);
      const results: GammaMarket[] = [];

      for (const batch of batches) {
        const ids = batch.join(',');
        const res = await fetch(`${GAMMA_API}/markets?condition_ids=${ids}&limit=100`);
        if (!res.ok) continue;
        const markets: GammaMarket[] = await res.json();
        results.push(...markets);
      }

      return results;
    },
    enabled: conditionIds.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}
