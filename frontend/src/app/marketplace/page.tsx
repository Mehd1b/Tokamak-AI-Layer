'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useIntentMatch, type RiskTolerance } from '@/hooks/useIntentMatch';
import { truncateAddress, truncateBytes32 } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ASSETS = [
  { key: 'USDC', label: 'USDC', icon: '$' },
  { key: 'ETH', label: 'ETH', icon: '\u039E' },
  { key: 'WETH', label: 'WETH', icon: '\u039E' },
  { key: 'any', label: 'Any Asset', icon: '\u2731' },
] as const;

const RISK_LEVELS: { key: RiskTolerance; label: string; subtitle: string; color: string; border: string; bg: string }[] = [
  {
    key: 'low',
    label: 'Conservative',
    subtitle: 'Minimize drawdown, prioritize capital preservation',
    color: 'text-green-400',
    border: 'border-green-500/20 hover:border-green-500/40',
    bg: 'bg-green-500/5',
  },
  {
    key: 'medium',
    label: 'Balanced',
    subtitle: 'Moderate risk for steady returns',
    color: 'text-amber-400',
    border: 'border-amber-500/20 hover:border-amber-500/40',
    bg: 'bg-amber-500/5',
  },
  {
    key: 'high',
    label: 'Aggressive',
    subtitle: 'Higher risk tolerance for maximum returns',
    color: 'text-red-400',
    border: 'border-red-500/20 hover:border-red-500/40',
    bg: 'bg-red-500/5',
  },
];

const STRATEGIES = [
  { key: 'yield', label: 'Yield Farming' },
  { key: 'perp', label: 'Perp Trading' },
  { key: 'prediction', label: 'Prediction Markets' },
  { key: 'any', label: 'Any Strategy' },
] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function apyRiskColor(apy: number): string {
  if (apy <= 10) return 'text-green-400';
  if (apy <= 20) return 'text-emerald-400';
  if (apy <= 30) return 'text-amber-400';
  if (apy <= 40) return 'text-orange-400';
  return 'text-red-400';
}

function apyRiskBg(apy: number): string {
  if (apy <= 10) return 'bg-green-500';
  if (apy <= 20) return 'bg-emerald-500';
  if (apy <= 30) return 'bg-amber-500';
  if (apy <= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

function scoreColor(score: number): { ring: string; text: string; bg: string } {
  if (score >= 80) return { ring: 'stroke-green-400', text: 'text-green-400', bg: 'bg-green-500/10' };
  if (score >= 60) return { ring: 'stroke-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (score >= 40) return { ring: 'stroke-amber-400', text: 'text-amber-400', bg: 'bg-amber-500/10' };
  return { ring: 'stroke-red-400', text: 'text-red-400', bg: 'bg-red-500/10' };
}

function reasonBadge(reason: string): { bg: string; text: string; border: string } {
  const r = reason.toLowerCase();
  if (r.includes('low drawdown') || r.includes('within limit')) return { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' };
  if (r.includes('apy') || r.includes('exceeds') || r.includes('near target')) return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
  if (r.includes('battle') || r.includes('established')) return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
  if (r.includes('tvl') || r.includes('confidence')) return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' };
  if (r.includes('new')) return { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' };
  return { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' };
}

/* ------------------------------------------------------------------ */
/*  Score Ring component                                               */
/* ------------------------------------------------------------------ */

function ScoreRing({ score }: { score: number }) {
  const colors = scoreColor(score);
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/5" />
        <circle
          cx="20" cy="20" r="18" fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={colors.ring}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-mono font-bold ${colors.text}`}>{score}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step indicator                                                     */
/* ------------------------------------------------------------------ */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isCompleted = stepNum < current;

        return (
          <div key={stepNum} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-medium transition-all duration-300 ${
                isActive
                  ? 'bg-[#A855F7]/20 text-[#C084FC] border border-[#A855F7]/40'
                  : isCompleted
                    ? 'bg-[#A855F7]/10 text-[#C084FC]/60 border border-[#A855F7]/20'
                    : 'bg-white/[0.02] text-gray-600 border border-white/5'
              }`}
            >
              {isCompleted ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                stepNum
              )}
            </div>
            {stepNum < total && (
              <div className={`w-8 h-px transition-colors duration-300 ${
                isCompleted ? 'bg-[#A855F7]/30' : 'bg-white/5'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1: Asset selection                                            */
/* ------------------------------------------------------------------ */

function StepAsset({
  selected,
  onSelect,
  onNext,
}: {
  selected: string;
  onSelect: (asset: string) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h2
        className="text-2xl md:text-3xl font-light mb-2 tracking-tight"
        style={{ fontFamily: 'var(--font-serif), serif' }}
      >
        What asset do you want to <span className="italic text-[#A855F7]">deposit</span>?
      </h2>
      <p className="text-gray-500 text-sm font-mono mb-8">
        Choose the asset you want to put to work.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {ASSETS.map((asset) => {
          const isSelected = selected === asset.key;
          return (
            <button
              key={asset.key}
              onClick={() => onSelect(asset.key)}
              className={`relative rounded-xl border p-5 text-left transition-all duration-300 group ${
                isSelected
                  ? 'border-[#A855F7]/40 bg-[#A855F7]/5'
                  : 'border-white/5 bg-[#12121a]/80 hover:border-white/10 hover:bg-white/[0.02]'
              }`}
            >
              <div className={`text-2xl mb-3 ${isSelected ? 'text-[#C084FC]' : 'text-gray-500 group-hover:text-gray-400'} transition-colors`}>
                {asset.icon}
              </div>
              <p className={`text-sm font-mono font-medium ${isSelected ? 'text-white' : 'text-gray-400'} transition-colors`}>
                {asset.label}
              </p>
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <svg className="w-4 h-4 text-[#A855F7]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={onNext}
        className="px-6 py-2.5 rounded-lg bg-[#A855F7]/10 border border-[#A855F7]/20 text-sm font-mono text-[#C084FC] hover:bg-[#A855F7]/20 hover:border-[#A855F7]/40 transition-all"
      >
        Continue
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2: Target APY                                                 */
/* ------------------------------------------------------------------ */

function StepApy({
  targetApy,
  onChangeApy: onApyChange,
  onNext,
  onBack,
}: {
  targetApy: number;
  onChangeApy: (apy: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const riskColor = apyRiskColor(targetApy);
  const riskBg = apyRiskBg(targetApy);
  const riskLabel = targetApy <= 10 ? 'Low Risk' : targetApy <= 20 ? 'Moderate' : targetApy <= 30 ? 'Elevated' : targetApy <= 40 ? 'High Risk' : 'Very High Risk';

  return (
    <div>
      <h2
        className="text-2xl md:text-3xl font-light mb-2 tracking-tight"
        style={{ fontFamily: 'var(--font-serif), serif' }}
      >
        What&apos;s your <span className="italic text-[#A855F7]">target return</span>?
      </h2>
      <p className="text-gray-500 text-sm font-mono mb-8">
        Set your desired annualized yield. Higher targets come with higher risk.
      </p>

      <div className="max-w-lg">
        {/* APY display */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-2">
            <span className={`text-5xl font-light font-mono tracking-tight ${riskColor}`}>
              {targetApy}
            </span>
            <span className="text-lg font-mono text-gray-500">% APY</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${riskBg}`} />
            <span className={`text-xs font-mono ${riskColor}`}>{riskLabel}</span>
          </div>
        </div>

        {/* Slider */}
        <div className="relative mb-6">
          <input
            type="range"
            min={5}
            max={50}
            step={1}
            value={targetApy}
            onChange={(e) => onApyChange(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-[#A855F7]
              [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-[#C084FC]
              [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(168,85,247,0.4)]
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-moz-range-thumb]:w-5
              [&::-moz-range-thumb]:h-5
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-[#A855F7]
              [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-[#C084FC]
              [&::-moz-range-thumb]:cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-gray-600 mt-2">
            <span>5%</span>
            <span>15%</span>
            <span>25%</span>
            <span>35%</span>
            <span>50%</span>
          </div>
        </div>

        {/* Risk color bar */}
        <div className="h-1 rounded-full overflow-hidden flex mb-8">
          <div className="flex-1 bg-green-500/60" />
          <div className="flex-1 bg-emerald-500/60" />
          <div className="flex-1 bg-amber-500/60" />
          <div className="flex-1 bg-orange-500/60" />
          <div className="flex-1 bg-red-500/60" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-mono text-gray-400 hover:text-white hover:border-white/20 transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 rounded-lg bg-[#A855F7]/10 border border-[#A855F7]/20 text-sm font-mono text-[#C084FC] hover:bg-[#A855F7]/20 hover:border-[#A855F7]/40 transition-all"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3: Risk tolerance                                             */
/* ------------------------------------------------------------------ */

function StepRisk({
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  selected: RiskTolerance;
  onSelect: (risk: RiskTolerance) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2
        className="text-2xl md:text-3xl font-light mb-2 tracking-tight"
        style={{ fontFamily: 'var(--font-serif), serif' }}
      >
        What&apos;s your <span className="italic text-[#A855F7]">risk tolerance</span>?
      </h2>
      <p className="text-gray-500 text-sm font-mono mb-8">
        This determines how we filter vaults by drawdown history.
      </p>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {RISK_LEVELS.map((level) => {
          const isSelected = selected === level.key;
          return (
            <button
              key={level.key}
              onClick={() => onSelect(level.key)}
              className={`relative rounded-xl border p-6 text-left transition-all duration-300 ${
                isSelected
                  ? `${level.border.split(' ')[0]} ${level.bg}`
                  : 'border-white/5 bg-[#12121a]/80 hover:border-white/10'
              }`}
            >
              <div className={`text-lg font-mono font-medium mb-2 ${isSelected ? level.color : 'text-gray-300'} transition-colors`}>
                {level.label}
              </div>
              <p className="text-xs font-mono text-gray-500 leading-relaxed">
                {level.subtitle}
              </p>
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <svg className={`w-4 h-4 ${level.color}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-mono text-gray-400 hover:text-white hover:border-white/20 transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 rounded-lg bg-[#A855F7]/10 border border-[#A855F7]/20 text-sm font-mono text-[#C084FC] hover:bg-[#A855F7]/20 hover:border-[#A855F7]/40 transition-all"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 4: Strategy preference                                        */
/* ------------------------------------------------------------------ */

function StepStrategy({
  selected,
  onToggle,
  onSearch,
  onBack,
  isLoading,
}: {
  selected: string[];
  onToggle: (strategy: string) => void;
  onSearch: () => void;
  onBack: () => void;
  isLoading: boolean;
}) {
  return (
    <div>
      <h2
        className="text-2xl md:text-3xl font-light mb-2 tracking-tight"
        style={{ fontFamily: 'var(--font-serif), serif' }}
      >
        Strategy <span className="italic text-[#A855F7]">preference</span>?
      </h2>
      <p className="text-gray-500 text-sm font-mono mb-8">
        Optional — select the types of strategies you are interested in, or choose &quot;Any&quot;.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {STRATEGIES.map((strategy) => {
          const isSelected = selected.includes(strategy.key);
          // If "any" is selected, highlight it and dim others
          const isAnyMode = selected.includes('any');
          const dimmed = isAnyMode && strategy.key !== 'any';

          return (
            <button
              key={strategy.key}
              onClick={() => onToggle(strategy.key)}
              className={`relative rounded-xl border p-5 text-left transition-all duration-300 ${
                isSelected
                  ? 'border-[#A855F7]/40 bg-[#A855F7]/5'
                  : dimmed
                    ? 'border-white/5 bg-[#12121a]/40 opacity-50'
                    : 'border-white/5 bg-[#12121a]/80 hover:border-white/10 hover:bg-white/[0.02]'
              }`}
            >
              <p className={`text-sm font-mono font-medium ${isSelected ? 'text-white' : 'text-gray-400'} transition-colors`}>
                {strategy.label}
              </p>
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <svg className="w-4 h-4 text-[#A855F7]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-mono text-gray-400 hover:text-white hover:border-white/20 transition-all"
        >
          Back
        </button>
        <button
          onClick={onSearch}
          disabled={isLoading}
          className="px-6 py-2.5 rounded-lg bg-[#A855F7]/15 border border-[#A855F7]/30 text-sm font-mono text-[#C084FC] hover:bg-[#A855F7]/25 hover:border-[#A855F7]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-20" />
                <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Scanning vaults...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Find Matching Vaults
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 5: Results                                                    */
/* ------------------------------------------------------------------ */

function StepResults({
  matches,
  totalVaultsScanned,
  preferences,
  onScanAgain,
  onReset,
  error,
}: {
  matches: { vaultAddress: string; chainId: number; score: number; estimatedApy: number; maxDrawdown: number; tvl: number; agentId: string; reasons: string[] }[];
  totalVaultsScanned: number;
  preferences: { asset: string; targetApy: number; riskTolerance: string };
  onScanAgain: () => void;
  onReset: () => void;
  error: string | null;
}) {
  const chainName = (chainId: number) => {
    switch (chainId) {
      case 1: return 'Ethereum';
      case 42161: return 'Arbitrum';
      case 10: return 'Optimism';
      case 11155111: return 'Sepolia';
      case 999: return 'HyperEVM';
      case 998: return 'HyperEVM Testnet';
      default: return `Chain ${chainId}`;
    }
  };

  if (error) {
    return (
      <div>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-red-400 text-sm font-mono mb-4">{error}</p>
          <button
            onClick={onScanAgain}
            className="text-[11px] font-mono text-[#C084FC] hover:text-[#A855F7] transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="text-2xl md:text-3xl font-light mb-1 tracking-tight"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            <span className="italic text-[#A855F7]">Matched</span>{' '}
            <span className="text-white">Vaults</span>
          </h2>
          <p className="text-xs font-mono text-gray-500">
            {totalVaultsScanned} vault{totalVaultsScanned !== 1 ? 's' : ''} scanned
            {' \u00b7 '}{preferences.asset.toUpperCase()}
            {' \u00b7 '}{preferences.targetApy}% target
            {' \u00b7 '}{preferences.riskTolerance} risk
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onScanAgain}
            className="px-4 py-2 rounded-lg border border-white/10 text-xs font-mono text-gray-400 hover:text-white hover:border-white/20 transition-all"
          >
            Adjust &amp; Rescan
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-lg border border-white/10 text-xs font-mono text-gray-400 hover:text-white hover:border-white/20 transition-all"
          >
            Start Over
          </button>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-16">
          <div className="mb-4">
            <div className="w-14 h-14 mx-auto rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">No vaults match your criteria</p>
          <p className="text-gray-600 text-xs font-mono mb-6">
            Try adjusting your preferences or check back later as new vaults are deployed.
          </p>
          <button
            onClick={onScanAgain}
            className="text-[11px] font-mono text-[#C084FC] hover:text-[#A855F7] transition-colors"
          >
            Adjust preferences
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match, i) => (
            <div
              key={`${match.vaultAddress}-${match.chainId}`}
              className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#12121a]/80 backdrop-blur-sm p-5 group transition-all duration-500 ease-out hover:border-[#A855F7]/20 vault-card-enter"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start gap-5">
                {/* Score ring */}
                <ScoreRing score={match.score} />

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  {/* Row 1: Vault address + chain */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-mono font-medium text-gray-200 group-hover:text-white transition-colors">
                      {truncateAddress(match.vaultAddress, 6)}
                    </h3>
                    <span className="text-[10px] font-mono text-gray-500 bg-white/[0.03] px-1.5 py-0.5 rounded">
                      {chainName(match.chainId)}
                    </span>
                  </div>

                  {/* Row 2: Agent ID */}
                  <p className="text-[11px] font-mono text-gray-500 mb-3">
                    Agent: {truncateBytes32(match.agentId, 6)}
                  </p>

                  {/* Row 3: Metrics */}
                  <div className="flex items-center gap-4 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-600 font-mono">APY</p>
                      <p className={`text-sm font-mono font-medium ${match.estimatedApy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {match.estimatedApy.toFixed(1)}%
                      </p>
                    </div>
                    <div className="w-px h-8 bg-white/5" />
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-600 font-mono">Drawdown</p>
                      <p className={`text-sm font-mono font-medium ${match.maxDrawdown <= 3 ? 'text-green-400' : match.maxDrawdown <= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                        {match.maxDrawdown.toFixed(1)}%
                      </p>
                    </div>
                    <div className="w-px h-8 bg-white/5" />
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-600 font-mono">TVL</p>
                      <p className="text-sm font-mono font-medium text-gray-300">
                        {match.tvl >= 1_000_000
                          ? `${(match.tvl / 1_000_000).toFixed(1)}M`
                          : match.tvl >= 1_000
                            ? `${(match.tvl / 1_000).toFixed(1)}K`
                            : match.tvl.toFixed(2)
                        }
                      </p>
                    </div>
                  </div>

                  {/* Row 4: Reason badges */}
                  {match.reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {match.reasons.map((reason, j) => {
                        const badge = reasonBadge(reason);
                        return (
                          <span
                            key={j}
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-mono font-medium ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {reason}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Deposit button */}
                <div className="shrink-0 self-center">
                  <Link
                    href={`/vaults/${match.vaultAddress}`}
                    className="px-5 py-2.5 rounded-lg bg-[#A855F7]/10 border border-[#A855F7]/20 text-xs font-mono text-[#C084FC] hover:bg-[#A855F7]/20 hover:border-[#A855F7]/40 transition-all inline-flex items-center gap-2"
                  >
                    Deposit
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export default function MarketplacePage() {
  const {
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
  } = useIntentMatch();

  const handleStrategyToggle = (strategy: string) => {
    const current = preferences.strategyPreference;

    if (strategy === 'any') {
      // Toggle "any" — if already selected, deselect; otherwise select only "any"
      updatePreference('strategyPreference', current.includes('any') ? [] : ['any']);
      return;
    }

    // Remove "any" when selecting a specific strategy
    let next = current.filter((s) => s !== 'any');

    if (next.includes(strategy)) {
      next = next.filter((s) => s !== strategy);
    } else {
      next.push(strategy);
    }

    // If nothing selected, default to "any"
    if (next.length === 0) next = ['any'];

    updatePreference('strategyPreference', next);
  };

  const handleScanAgain = () => {
    setStep(4); // Go back to last preference step
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono">
            Intent Matching
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Find</span>{' '}
          <span className="text-white">Your Vault</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Tell us what you are looking for and we will match you with the best-performing vaults for your strategy.
        </p>
      </div>

      {/* Step indicator */}
      {step < 5 && <StepIndicator current={step} total={4} />}

      {/* Wizard steps */}
      {step === 1 && (
        <StepAsset
          selected={preferences.asset}
          onSelect={(asset) => updatePreference('asset', asset)}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepApy
          targetApy={preferences.targetApy}
          onChangeApy={(apy) => updatePreference('targetApy', apy)}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <StepRisk
          selected={preferences.riskTolerance}
          onSelect={(risk) => updatePreference('riskTolerance', risk)}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && (
        <StepStrategy
          selected={preferences.strategyPreference}
          onToggle={handleStrategyToggle}
          onSearch={search}
          onBack={() => setStep(3)}
          isLoading={isLoading}
        />
      )}

      {step === 5 && (
        <StepResults
          matches={matches}
          totalVaultsScanned={totalVaultsScanned}
          preferences={preferences}
          onScanAgain={handleScanAgain}
          onReset={reset}
          error={error}
        />
      )}

      {/* Loading overlay on results step */}
      {isLoading && step === 5 && (
        <div className="flex flex-col items-center justify-center py-20">
          <svg className="w-10 h-10 animate-spin text-[#A855F7]/40 mb-4" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-20" />
            <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-mono text-gray-400">Scanning vaults across chains...</p>
          <p className="text-xs font-mono text-gray-600 mt-1">This may take a few seconds</p>
        </div>
      )}
    </div>
  );
}
