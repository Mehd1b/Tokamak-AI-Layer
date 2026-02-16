'use client';

import { useState, useEffect } from 'react';
import { Send, Loader2, AlertCircle, CheckCircle, FileCode, FileText, Shield, CheckCircle2, XCircle, Coins, Download, ChevronDown, ChevronUp, PieChart, Calendar, Target, TrendingUp } from 'lucide-react';
import { useSubmitTask } from '@/hooks/useAgentRuntime';
import { useRequestValidation, useRequestValidationOnChain } from '@/hooks/useValidation';
import { StrategyReportView, isStrategyReport } from './StrategyReportView';
import { usePayForTask, useTONBalanceL2, generateTaskRef, useRefundTask } from '@/hooks/useTaskFee';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { useL2Config } from '@/hooks/useL2Config';

/** Well-known ERC-20 tokens on Ethereum mainnet (address -> { symbol, decimals }) */
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
  '0x853d955acef822db058eb8505911ed77f175b99e': { symbol: 'FRAX', decimals: 18 },
  '0x5f98805a4e8be255a32880fdec7f6728c6568ba0': { symbol: 'LUSD', decimals: 18 },
  '0x57ab1ec28d129707052df4df418d58a2d46d5f51': { symbol: 'sUSD', decimals: 18 },
  '0x6c3ea9036406852006290770bedfcaba0e23a0e8': { symbol: 'PYUSD', decimals: 6 },
  '0x056fd409e1d7a124bd7017459dfea2f387b6d5cd': { symbol: 'GUSD', decimals: 2 },
  '0xdc035d45d973e3ec169d2276ddab16f1e407384f': { symbol: 'USDS', decimals: 18 },
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { symbol: 'stETH', decimals: 18 },
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': { symbol: 'wstETH', decimals: 18 },
  '0xbe9895146f7af43049ca1c1ae358b0541ea49704': { symbol: 'cbETH', decimals: 18 },
  '0xae78736cd615f374d3085123a210448e74fc6393': { symbol: 'rETH', decimals: 18 },
  '0xfe0c30065b384f05761f15d0cc899d4f9f9cc0eb': { symbol: 'ETHFI', decimals: 18 },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'cbBTC', decimals: 8 },
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18 },
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', decimals: 18 },
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': { symbol: 'MKR', decimals: 18 },
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': { symbol: 'SNX', decimals: 18 },
  '0x5a98fcbea516cf06857215779fd812ca3bef1b32': { symbol: 'LDO', decimals: 18 },
  '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18 },
  '0xc944e90c64b2c07662a292be6244bdf05cda44a7': { symbol: 'GRT', decimals: 18 },
  '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72': { symbol: 'ENS', decimals: 18 },
  '0x808507121b80c02388fad14726482e061b8da827': { symbol: 'PENDLE', decimals: 18 },
  '0x57e114b691db790c35207b2e685d4a43181e6061': { symbol: 'ENA', decimals: 18 },
  '0xd533a949740bb3306d119cc777fa900ba034cd52': { symbol: 'CRV', decimals: 18 },
  '0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b': { symbol: 'CVX', decimals: 18 },
  '0xc00e94cb662c3520282e6f5717214004a7f26888': { symbol: 'COMP', decimals: 18 },
  '0xba100000625a3754423978a60c9317c58a424e3d': { symbol: 'BAL', decimals: 18 },
  '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2': { symbol: 'SUSHI', decimals: 18 },
  '0x111111111117dc0aa78b770fa6a738034120c302': { symbol: '1INCH', decimals: 18 },
  '0x92d6c1e31e14520e676a687f0a93788b716beff5': { symbol: 'DYDX', decimals: 18 },
  '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0': { symbol: 'FXS', decimals: 18 },
  '0x6dea81c8171d0ba574754ef6f8b412f2ed88c54d': { symbol: 'LQTY', decimals: 18 },
  '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e': { symbol: 'YFI', decimals: 18 },
  '0x090185f2135308bad17527004364ebcc2d37e5f6': { symbol: 'SPELL', decimals: 18 },
  '0xdbdb4d16eda451d0503b854cf79d55697f90c8df': { symbol: 'ALCX', decimals: 18 },
  '0x3472a5a71965499acd81997a54bba8d852c6e53d': { symbol: 'BADGER', decimals: 18 },
  '0xbc396689893d065f41bc2c6ecbee5e0085233447': { symbol: 'PERP', decimals: 18 },
  '0xaf5191b0de278c7286d6c7cc6ab6bb8a73ba2cd6': { symbol: 'STG', decimals: 18 },
  '0xdef1ca1fb7fbcdc777520aa7f396b4e015f497ab': { symbol: 'COW', decimals: 18 },
  '0x9994e35db50125e0df82e4c2dde62496ce330999': { symbol: 'MORPHO', decimals: 18 },
  '0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3': { symbol: 'ONDO', decimals: 18 },
  '0x56072c95faa7f9e7775e16db4f88fc96c79b77de': { symbol: 'SKY', decimals: 18 },
  '0xec53bf9167f50cdeb3ae105f56099aaab9061f83': { symbol: 'EIGEN', decimals: 18 },
  '0xb50721bcf8d664c30412cfbc6cf7a15145234ad1': { symbol: 'ARB', decimals: 18 },
  '0x4200000000000000000000000000000000000042': { symbol: 'OP', decimals: 18 },
  '0x455e53cbb86018ac2b8092fdcd39d8444affc3f6': { symbol: 'POL', decimals: 18 },
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0': { symbol: 'MATIC', decimals: 18 },
  '0xaea46a60368a7bd060eec7df8cba43b7ef41ad85': { symbol: 'FET', decimals: 18 },
  '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24': { symbol: 'RNDR', decimals: 18 },
  '0x967da4048cd07ab37855c090aaf366e4ce1b9f48': { symbol: 'OCEAN', decimals: 18 },
  '0x6e2a43be0b1d33b726f0ca3b8de60b3482b8b050': { symbol: 'ARKM', decimals: 18 },
  '0x6982508145454ce325ddbe47a25d4ec3d2311933': { symbol: 'PEPE', decimals: 18 },
  '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': { symbol: 'SHIB', decimals: 18 },
  '0xcf0c122c6b73ff809c693db761e7baebe62b6a2e': { symbol: 'FLOKI', decimals: 9 },
  '0xa35923162c49cf95e6bf26623385eb431ad920d3': { symbol: 'TURBO', decimals: 18 },
  '0xbb0e17ef65f82ab018d8edd776e8dd940327b28b': { symbol: 'AXS', decimals: 18 },
  '0x3845badade8e6dff049820680d1f14bd3903a5d0': { symbol: 'SAND', decimals: 18 },
  '0x0f5d2fb29fb7d3cfee444a200298f468908cc942': { symbol: 'MANA', decimals: 18 },
  '0x45804880de22913dafe09f4980848ece6ecbaf78': { symbol: 'PAXG', decimals: 18 },
  '0x3c3a81e81dc49a522a592e7622a7e711c06bf354': { symbol: 'MNT', decimals: 18 },
  '0xf57e7e7c23978c3caec3c3548e3d615c346e79ff': { symbol: 'IMX', decimals: 18 },
  '0xb23d80f5fefcddaa212212f028021b41ded428cf': { symbol: 'PRIME', decimals: 18 },
  '0x4d224452801aced8b2f0aebe155379bb5d594381': { symbol: 'APE', decimals: 18 },
  '0xe28b3b32b6c345a34ff64674606124dd5aceca30': { symbol: 'INJ', decimals: 18 },
  '0x4a220e6096b25eadb88358cb44068a3248254675': { symbol: 'QNT', decimals: 18 },
  '0x5283d291dbcf85356a21ba090e6db59121208b44': { symbol: 'BLUR', decimals: 18 },
  '0x6810e776880c02933d47db1b9fc05908e5386b96': { symbol: 'GNO', decimals: 18 },
  '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd': { symbol: 'LRC', decimals: 18 },
  '0x58b6a8a3302369daec383334672404ee733ab239': { symbol: 'LPT', decimals: 18 },
  '0xba11d00c5f74255f56a5e366f4f77f5a186d7f55': { symbol: 'BAND', decimals: 18 },
  '0x0b38210ea11411557c13457d4da7dc6ea731b88a': { symbol: 'API3', decimals: 18 },
  '0xd26114cd6ee289accf82350c8d8487fedb8a0c07': { symbol: 'OMG', decimals: 18 },
  '0x0d8775f648430679a709e98d2b0cb6250d2887ef': { symbol: 'BAT', decimals: 18 },
  '0xb64ef51c888972c908cfacf59b47c1afbc0ab8ac': { symbol: 'STORJ', decimals: 8 },
  '0x7dd9c5cba05e151c895fde1cf355c9a1d5da6429': { symbol: 'GLM', decimals: 18 },
  '0x320623b8e4ff03373931769a31fc52a4e78b5d70': { symbol: 'RSR', decimals: 18 },
  '0x7420b4b9a0110cdc71fb720908340c03f9bc03ec': { symbol: 'JASMY', decimals: 18 },
  '0xd1d2eb1b1e90b638588728b4130137d262c87cae': { symbol: 'GALA', decimals: 8 },
  '0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c': { symbol: 'ENJ', decimals: 18 },
  '0x767fe9edc9e0df98e07454847909b5e959d7ca0e': { symbol: 'ILV', decimals: 18 },
  '0xccc8cb5229b0ac8069c51fd58367fd1e622afd97': { symbol: 'GODS', decimals: 18 },
  '0xac51066d7bec65dc4589368da368b212745d63e8': { symbol: 'ALICE', decimals: 6 },
  '0xaaee1a9723aadb7afa2810263653a34ba2c21c7a': { symbol: 'MOG', decimals: 18 },
  '0x761d38e5ddf6ccf6cf7c55759d5210750b5d60f3': { symbol: 'ELON', decimals: 18 },
  '0xb131f4a55907b10d1f0a50d8ab8fa09ec342cd74': { symbol: 'MEME', decimals: 18 },
  '0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c': { symbol: 'SPX', decimals: 8 },
  '0xdab396ccf3d84cf2d07c4ccc0027ecdd34d7ef1f': { symbol: 'GFI', decimals: 18 },
  '0x33349b282065b0284d756f0577fb39c158f935e6': { symbol: 'MPL', decimals: 18 },
  '0x88df592f8eb5d7bd38bfef7deb0fbc02cf3778a0': { symbol: 'TRB', decimals: 18 },
  '0x6b0b3a982b4634ac68dd83a4dbf02311ce324181': { symbol: 'ALI', decimals: 18 },
  '0xbe0ed4138121ecfc5c0e56b40517da27e6c5226b': { symbol: 'ATH', decimals: 18 },
  '0x5afe3855358e112b5647b952709e6165e1c1eeee': { symbol: 'SAFE', decimals: 18 },
  '0x3506424f91fd33084466f402d5d97f05f8e3b4af': { symbol: 'CHZ', decimals: 18 },
  '0x69af81e73a73b40adf4f3d4223cd9b1ece623074': { symbol: 'MASK', decimals: 18 },
  '0x8290333cef9e6d528dd5618fb97a76f268f3edd4': { symbol: 'ANKR', decimals: 18 },
  '0x4e15361fd6b4bb609fa63c81a2be19d873717870': { symbol: 'FTM', decimals: 18 },
  '0x9e32b13ce7f2e80a01932b42553652e053d6ed8e': { symbol: 'METIS', decimals: 18 },
  '0x00c83aecc790e8a4453e5dd3b0b4b3680501a7a7': { symbol: 'SKL', decimals: 18 },
  '0x4f9254c83eb525f9fcf346490bbb3ed28a81c667': { symbol: 'CELR', decimals: 18 },
};

/** Resolve a token address to its symbol and decimals */
function resolveToken(address: string): { symbol: string; decimals: number } {
  return KNOWN_TOKENS[address.toLowerCase()] ?? { symbol: address.slice(0, 6) + '...' + address.slice(-4), decimals: 18 };
}

/** Format a wei amount to a human-readable string */
function formatTokenAmount(weiStr: string, decimals: number): string {
  try {
    const wei = BigInt(weiStr);
    const divisor = 10n ** BigInt(decimals);
    const whole = wei / divisor;
    const fraction = wei % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 6);
    // Trim trailing zeros
    const trimmed = fractionStr.replace(/0+$/, '') || '0';
    if (whole === 0n && trimmed === '0') return '< 0.000001';
    return `${whole.toLocaleString()}.${trimmed}`;
  } catch {
    return weiStr;
  }
}

/** Detect trading strategy output (from trading-agent) */
function isTradingStrategy(obj: unknown): obj is { strategy: { id: string; analysis: unknown; trades: unknown[]; mode?: string; investmentPlan?: unknown; llmReasoning?: string }; unsignedSwaps?: unknown[] } {
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

interface InvestmentPlanData {
  allocations: Array<{ tokenAddress: string; symbol: string; targetPercent: number; reasoning: string }>;
  entryStrategy: string;
  dcaSchedule?: { frequency: string; totalPeriods: number; amountPerPeriodPercent: number };
  rebalancing?: { type: string; frequency?: string; driftThresholdPercent?: number };
  exitCriteria?: { takeProfitPercent?: number; stopLossPercent?: number; trailingStopPercent?: number; timeExitMonths?: number };
  thesis: string;
}

function InvestmentPlanView({ plan }: { plan: InvestmentPlanData }) {
  return (
    <div className="space-y-3">
      {/* Thesis */}
      <div className="rounded-lg border border-[#38BDF8]/20 bg-[#38BDF8]/5 p-3">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-[#38BDF8]" />
          <p className="text-xs font-medium text-[#38BDF8] uppercase tracking-wide">Investment Thesis</p>
        </div>
        <p className="text-sm text-zinc-300">{plan.thesis}</p>
      </div>

      {/* Portfolio Allocation */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <PieChart className="h-4 w-4 text-zinc-400" />
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Portfolio Allocation</p>
        </div>
        <div className="space-y-1">
          {plan.allocations.map((alloc, i) => (
            <div key={i} className="rounded-lg bg-white/5 px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{alloc.symbol}</span>
                <span className="text-sm font-mono font-bold text-[#38BDF8]">{alloc.targetPercent}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-1">
                <div
                  className="bg-[#38BDF8] h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, alloc.targetPercent)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-400">{alloc.reasoning}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Entry Strategy & DCA */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/5 p-2">
          <div className="flex items-center gap-1 mb-1">
            <Target className="h-3 w-3 text-zinc-400" />
            <p className="text-[10px] text-zinc-500">Entry Strategy</p>
          </div>
          <p className="text-sm font-medium text-white capitalize">{plan.entryStrategy}</p>
        </div>
        {plan.dcaSchedule && (
          <div className="rounded-lg bg-white/5 p-2">
            <div className="flex items-center gap-1 mb-1">
              <Calendar className="h-3 w-3 text-zinc-400" />
              <p className="text-[10px] text-zinc-500">DCA Schedule</p>
            </div>
            <p className="text-sm font-medium text-white capitalize">{plan.dcaSchedule.frequency}</p>
            <p className="text-[10px] text-zinc-400">{plan.dcaSchedule.totalPeriods} periods, {plan.dcaSchedule.amountPerPeriodPercent}% each</p>
          </div>
        )}
      </div>

      {/* Rebalancing */}
      {plan.rebalancing && (
        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-[10px] text-zinc-500 mb-1">Rebalancing</p>
          <p className="text-sm text-white capitalize">
            {plan.rebalancing.type}
            {plan.rebalancing.frequency && ` (${plan.rebalancing.frequency})`}
            {plan.rebalancing.driftThresholdPercent != null && ` — drift threshold: ${plan.rebalancing.driftThresholdPercent}%`}
          </p>
        </div>
      )}

      {/* Exit Criteria */}
      {plan.exitCriteria && (
        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-[10px] text-zinc-500 mb-1">Exit Criteria</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {plan.exitCriteria.takeProfitPercent != null && (
              <span className="text-emerald-400">Take Profit: {plan.exitCriteria.takeProfitPercent}%</span>
            )}
            {plan.exitCriteria.stopLossPercent != null && (
              <span className="text-red-400">Stop Loss: {plan.exitCriteria.stopLossPercent}%</span>
            )}
            {plan.exitCriteria.trailingStopPercent != null && (
              <span className="text-amber-400">Trailing Stop: {plan.exitCriteria.trailingStopPercent}%</span>
            )}
            {plan.exitCriteria.timeExitMonths != null && (
              <span className="text-zinc-300">Time Exit: {plan.exitCriteria.timeExitMonths} months</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TradingStrategyView({ data, serviceUrl }: { data: { strategy: { id: string; mode?: string; analysis: { marketCondition: string; confidence: number; reasoning: string }; trades: Array<{ action: string; tokenIn: string; tokenOut: string; amountIn: string; poolFee: number; priceImpact: number }>; investmentPlan?: InvestmentPlanData; llmReasoning?: string; estimatedReturn?: { optimistic: number; expected: number; pessimistic: number } }; riskWarnings?: string[]; unsignedSwaps?: unknown[] }; serviceUrl?: string }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const { strategy, riskWarnings } = data;
  const isInvestmentMode = strategy.mode === 'investment' || strategy.mode === 'position';

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
      {/* Mode Badge + Market Analysis */}
      <div className="flex items-center gap-3 flex-wrap">
        {strategy.mode && (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-[#38BDF8]/20 text-[#38BDF8]">
            {strategy.mode.toUpperCase()}
          </span>
        )}
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

      {/* Investment Plan (for investment/position modes) */}
      {isInvestmentMode && strategy.investmentPlan && (
        <InvestmentPlanView plan={strategy.investmentPlan} />
      )}

      {/* LLM Reasoning (collapsible) */}
      {strategy.llmReasoning && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02]">
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="flex items-center justify-between w-full px-3 py-2 text-xs text-zinc-400 hover:text-zinc-300"
          >
            <span>LLM Reasoning</span>
            {showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showReasoning && (
            <div className="px-3 pb-3">
              <pre className="whitespace-pre-wrap text-xs text-zinc-400 font-mono leading-relaxed">
                {strategy.llmReasoning}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Trades */}
      {strategy.trades.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Trades ({strategy.trades.length})</p>
          {strategy.trades.map((t, i) => {
            const tokenIn = resolveToken(t.tokenIn);
            const tokenOut = resolveToken(t.tokenOut);
            const amountStr = formatTokenAmount(t.amountIn, tokenIn.decimals);
            return (
              <div key={i} className="rounded-lg bg-white/5 px-3 py-2.5 space-y-1.5">
                {/* Row 1: Action + Amount + Tokens */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.action === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {t.action.toUpperCase()}
                  </span>
                  <span className="text-sm font-mono font-medium text-white">{amountStr} {tokenIn.symbol}</span>
                  <span className="text-zinc-600">&rarr;</span>
                  <span className="text-sm font-medium text-white">{tokenOut.symbol}</span>
                  <div className="ml-auto flex items-center gap-2 text-xs">
                    <span className="text-zinc-400">Fee: {t.poolFee / 10000}%</span>
                    {t.priceImpact > 0 && (
                      <span className="text-amber-400">Impact: {t.priceImpact.toFixed(2)}%</span>
                    )}
                  </div>
                </div>
                {/* Row 2: Full addresses (copyable) */}
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                  <span className="select-all cursor-text" title={t.tokenIn}>{t.tokenIn}</span>
                  <span>&rarr;</span>
                  <span className="select-all cursor-text" title={t.tokenOut}>{t.tokenOut}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      {/* Download Bot Button — shown for all strategies (including investment/DCA with empty trades) */}
      {(strategy.trades.length > 0 || isInvestmentMode) && (
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
      )}
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

function renderPaymentInfo(payHash: string | undefined, explorerUrl: string) {
  if (!payHash) return null;
  return (
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
  );
}

function renderFeeEscrowStatus(
  hasFee: boolean | 0n | undefined,
  currentTaskRef: string | undefined,
  result: { metadata: Record<string, unknown> } | null,
  explorerUrl: string,
) {
  if (!hasFee || !currentTaskRef || !result?.metadata?.feeConfirmed) return null;
  const confirmTxHash = typeof result.metadata.confirmTxHash === 'string' ? result.metadata.confirmTxHash : null;
  return (
    <div className="mb-3 rounded bg-white/5 px-2 py-1">
      <p className="text-xs text-zinc-400">Fee Escrow</p>
      <p className="text-xs text-emerald-400 flex items-center gap-1">
        <CheckCircle className="h-3 w-3" /> Fees released to agent
        {confirmTxHash && (
          <a
            href={`${explorerUrl}/tx/${confirmTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 font-mono underline"
          >
            {confirmTxHash.slice(0, 14)}...
          </a>
        )}
      </p>
    </div>
  );
}

interface TaskSubmissionProps {
  agentId: string;
  agentName: string;
  placeholder: string;
  onChainAgentId?: bigint;
  feePerTask?: bigint;
  serviceUrl?: string;
  validationModel?: number;
}

type PaymentStep = 'input' | 'paying' | 'paid' | 'submitting';

export function TaskSubmission({ agentId, agentName, placeholder, onChainAgentId, feePerTask, serviceUrl, validationModel }: TaskSubmissionProps) {
  const [input, setInput] = useState('');
  const [nonce] = useState(() => BigInt(Date.now()));
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('input');
  const [currentTaskRef, setCurrentTaskRef] = useState<`0x${string}` | undefined>();

  const { address } = useAccount();
  const { explorerUrl, nativeCurrency } = useL2Config();
  const { data: balance } = useTONBalanceL2(address);
  const { submitTask, result, isSubmitting, error, reset } = useSubmitTask();
  const { pay, hash: payHashRaw, isPending: isPayPending, isConfirming: isPayConfirming, isSuccess: isPaySuccess, error: payError } = usePayForTask();
  const payHash: string | undefined = payHashRaw ? String(payHashRaw) : undefined;
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
          {renderPaymentInfo(payHash, explorerUrl)}

          {/* Fee escrow status — rendered via helper to avoid unknown type in JSX */}
          {renderFeeEscrowStatus(hasFee, currentTaskRef, result, explorerUrl)}

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
          {validationModel !== undefined && validationModel > 0 && (
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
          )}
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
