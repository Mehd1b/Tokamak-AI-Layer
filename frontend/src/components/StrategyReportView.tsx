'use client';

import { TrendingUp, TrendingDown, Shield, AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useState } from 'react';

/* ------------------------------------------------------------------ */
/* Types (mirrors the yield-agent JSON shape)                         */
/* ------------------------------------------------------------------ */

interface APYPrediction {
  mean: number;
  low: number;
  high: number;
}

interface APYFactor {
  name: string;
  impact: number;
  description: string;
}

interface ExpectedAPY {
  pool: string;
  currentAPY: number;
  predicted7d: APYPrediction;
  predicted30d: APYPrediction;
  predicted90d: APYPrediction;
  confidence: number;
  methodology: string;
  factors: APYFactor[];
}

interface EntryStep {
  type: string;
  contract: string;
  function: string;
  args: string[];
  chainId: number;
  description: string;
}

interface ExitCondition {
  type: string;
  threshold: number;
  description: string;
}

interface Allocation {
  protocol: string;
  pool: string;
  chain: number;
  percentage: number;
  amountUSD: number;
  expectedAPY: ExpectedAPY;
  riskScore: number;
  entrySteps: EntryStep[];
  exitConditions: ExitCondition[];
}

interface RiskBreakdown {
  smartContractRisk: number;
  marketRisk: number;
  liquidityRisk: number;
  protocolRisk: number;
  impermanentLoss: number;
  regulatoryRisk: number;
}

interface Alternative {
  name: string;
  blendedAPY: number;
  riskScore: number;
  reason: string;
}

interface StrategyReport {
  reportId: string;
  requestId: string;
  snapshotId: string;
  timestamp: number;
  riskProfile: {
    level: string;
    maxILTolerance: number;
    minTVL: number;
    minProtocolAge: number;
    chainPreferences: number[];
    excludeProtocols: string[];
    maxSinglePoolAllocation: number;
  };
  capitalUSD: number;
  allocations: Allocation[];
  expectedAPY: {
    blended: number;
    range: { low: number; high: number };
  };
  riskScore: {
    overall: number;
    breakdown: RiskBreakdown;
    confidence: number;
  };
  reasoning: string[];
  alternativesConsidered: Alternative[];
  warnings: string[];
  executionHash: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  42161: 'Arbitrum',
  137: 'Polygon',
  8453: 'Base',
  11155420: 'OP Sepolia',
};

function chainName(id: number): string {
  return CHAIN_NAMES[id] ?? `Chain ${id}`;
}

function formatPct(n: number, decimals = 2): string {
  return `${n.toFixed(decimals)}%`;
}

function formatUSD(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function riskColor(score: number): string {
  if (score <= 15) return 'text-emerald-400';
  if (score <= 30) return 'text-yellow-400';
  if (score <= 50) return 'text-orange-400';
  return 'text-red-400';
}

function riskBg(score: number): string {
  if (score <= 15) return 'bg-emerald-400/10 border-emerald-400/20';
  if (score <= 30) return 'bg-yellow-400/10 border-yellow-400/20';
  if (score <= 50) return 'bg-orange-400/10 border-orange-400/20';
  return 'bg-red-400/10 border-red-400/20';
}

function riskLabel(score: number): string {
  if (score <= 15) return 'Low';
  if (score <= 30) return 'Moderate';
  if (score <= 50) return 'High';
  return 'Very High';
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                     */
/* ------------------------------------------------------------------ */

function AllocationCard({ alloc, index }: { alloc: Allocation; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#38BDF8]/20 text-xs font-bold text-[#38BDF8]">
            {index + 1}
          </span>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{alloc.protocol}</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {chainName(alloc.chain)}
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-mono">{alloc.pool.slice(0, 8)}...</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-bold text-[#38BDF8]">{formatPct(alloc.percentage * 100, 0)}</p>
            <p className="text-xs text-zinc-500">{formatUSD(alloc.amountUSD)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-emerald-400">{formatPct(alloc.expectedAPY.currentAPY)}</p>
            <p className="text-xs text-zinc-500">APY</p>
          </div>
          <div className={`text-right ${riskColor(alloc.riskScore)}`}>
            <p className="text-sm font-bold">{alloc.riskScore}</p>
            <p className="text-xs opacity-70">Risk</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 space-y-3">
          {/* APY Predictions */}
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-1.5">APY Forecast</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '7d', pred: alloc.expectedAPY.predicted7d },
                { label: '30d', pred: alloc.expectedAPY.predicted30d },
                { label: '90d', pred: alloc.expectedAPY.predicted90d },
              ].map(({ label, pred }) => (
                <div key={label} className="rounded bg-white/5 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
                  <p className="text-xs font-semibold text-white">{formatPct(pred.mean)}</p>
                  <p className="text-[10px] text-zinc-500">{formatPct(pred.low)} - {formatPct(pred.high)}</p>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              Confidence: {formatPct(alloc.expectedAPY.confidence * 100, 0)} | Method: {alloc.expectedAPY.methodology.replace(/_/g, ' ')}
            </p>
          </div>

          {/* APY Factors */}
          {alloc.expectedAPY.factors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-1.5">Yield Factors</p>
              <div className="space-y-1">
                {alloc.expectedAPY.factors.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">{f.name.replace(/_/g, ' ')}</span>
                    <span className="text-zinc-300 text-right max-w-[60%] truncate">{f.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exit Conditions */}
          {alloc.exitConditions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-1.5">Exit Conditions</p>
              <div className="space-y-1">
                {alloc.exitConditions.map((ec, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px]">
                    <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-yellow-500/60" />
                    <span className="text-zinc-400">{ec.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entry Steps */}
          {alloc.entrySteps.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-1.5">Entry Steps</p>
              <div className="space-y-1">
                {alloc.entrySteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] text-zinc-400 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-zinc-400">{step.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RiskBreakdownBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-xs text-zinc-400 truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full ${value <= 3 ? 'bg-emerald-400' : value <= 5 ? 'bg-yellow-400' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-6 text-xs font-mono text-right ${value <= 3 ? 'text-emerald-400' : value <= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Component                                                     */
/* ------------------------------------------------------------------ */

export function isStrategyReport(obj: unknown): obj is StrategyReport {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.allocations) && o.expectedAPY != null && o.riskScore != null;
}

export function StrategyReportView({ report }: { report: StrategyReport }) {
  const [showMeta, setShowMeta] = useState(false);
  const ts = new Date(report.timestamp);

  return (
    <div className="space-y-4">
      {/* -------- Summary Header -------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[#38BDF8]/20 bg-[#38BDF8]/5 px-3 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[#38BDF8]/60 mb-0.5">Blended APY</p>
          <p className="text-xl font-bold text-[#38BDF8]">{formatPct(report.expectedAPY.blended)}</p>
          <p className="text-[10px] text-zinc-500">
            {formatPct(report.expectedAPY.range.low)} - {formatPct(report.expectedAPY.range.high)}
          </p>
        </div>
        <div className={`rounded-lg border px-3 py-2.5 text-center ${riskBg(report.riskScore.overall)}`}>
          <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">Risk Score</p>
          <p className={`text-xl font-bold ${riskColor(report.riskScore.overall)}`}>
            {report.riskScore.overall}
            <span className="text-xs font-normal opacity-60">/100</span>
          </p>
          <p className="text-[10px] text-zinc-500">{riskLabel(report.riskScore.overall)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">Capital</p>
          <p className="text-xl font-bold text-white">{formatUSD(report.capitalUSD)}</p>
          <p className="text-[10px] text-zinc-500">{report.allocations.length} pool{report.allocations.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">Profile</p>
          <p className="text-xl font-bold text-white capitalize">{report.riskProfile.level}</p>
          <p className="text-[10px] text-zinc-500">
            {report.riskProfile.chainPreferences.map(chainName).join(', ')}
          </p>
        </div>
      </div>

      {/* -------- Allocations -------- */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Portfolio Allocations
        </h4>
        <div className="space-y-2">
          {report.allocations.map((alloc, i) => (
            <AllocationCard key={alloc.pool} alloc={alloc} index={i} />
          ))}
        </div>
      </div>

      {/* -------- Risk Breakdown -------- */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Risk Breakdown
          <span className="ml-2 text-[10px] font-normal text-zinc-500">
            (confidence: {formatPct(report.riskScore.confidence * 100, 0)})
          </span>
        </h4>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <RiskBreakdownBar label="Smart Contract" value={report.riskScore.breakdown.smartContractRisk} />
          <RiskBreakdownBar label="Market" value={report.riskScore.breakdown.marketRisk} />
          <RiskBreakdownBar label="Liquidity" value={report.riskScore.breakdown.liquidityRisk} />
          <RiskBreakdownBar label="Protocol" value={report.riskScore.breakdown.protocolRisk} />
          <RiskBreakdownBar label="Impermanent Loss" value={report.riskScore.breakdown.impermanentLoss} />
          <RiskBreakdownBar label="Regulatory" value={report.riskScore.breakdown.regulatoryRisk} />
        </div>
      </div>

      {/* -------- Reasoning -------- */}
      {report.reasoning.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Reasoning
          </h4>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1.5">
            {report.reasoning.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#38BDF8] flex-shrink-0" />
                {r}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -------- Alternatives -------- */}
      {report.alternativesConsidered.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Alternatives Considered
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.alternativesConsidered.map((alt) => (
              <div key={alt.name} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-white capitalize">
                    {alt.name.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400">{formatPct(alt.blendedAPY)}</span>
                    <span className={riskColor(alt.riskScore)}>Risk {alt.riskScore}</span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500">{alt.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -------- Warnings -------- */}
      {report.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span className="text-xs font-semibold text-yellow-400">Warnings</span>
          </div>
          {report.warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-400/80 ml-6">{w}</p>
          ))}
        </div>
      )}

      {/* -------- Metadata Toggle -------- */}
      <button
        onClick={() => setShowMeta(!showMeta)}
        className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {showMeta ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Technical Details
      </button>
      {showMeta && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1 text-[11px] font-mono text-zinc-500">
          <div><span className="text-zinc-600">Report ID:</span> {report.reportId}</div>
          <div><span className="text-zinc-600">Request ID:</span> {report.requestId}</div>
          <div><span className="text-zinc-600">Snapshot ID:</span> {report.snapshotId}</div>
          <div><span className="text-zinc-600">Execution Hash:</span> {report.executionHash}</div>
          <div><span className="text-zinc-600">Generated:</span> {ts.toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}
