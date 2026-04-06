import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { mainnet, sepolia, arbitrum, optimism } from 'viem/chains';

/* ------------------------------------------------------------------ */
/*  Chain + contract configuration                                     */
/* ------------------------------------------------------------------ */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface ChainConfig {
  chainId: number;
  chain: any;
  rpcUrl: string | undefined;
  vaultFactory: `0x${string}`;
  agentRegistry: `0x${string}`;
}

const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId: 1,
    chain: mainnet,
    rpcUrl: process.env.RPC_MAINNET,
    vaultFactory: '0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39',
    agentRegistry: '0x2BF56f889Ab5E535C3194bB2B356f10D6fa2FBEc',
  },
  {
    chainId: 42161,
    chain: arbitrum,
    rpcUrl: process.env.RPC_ARBITRUM,
    vaultFactory: '0x7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611',
    agentRegistry: '0xa6b363872aC1AA91Bc6a270958A06230c10aa473',
  },
  {
    chainId: 10,
    chain: optimism,
    rpcUrl: process.env.RPC_OPTIMISM,
    vaultFactory: '0x7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611',
    agentRegistry: '0xa6b363872aC1AA91Bc6a270958A06230c10aa473',
  },
  {
    chainId: 11155111,
    chain: sepolia,
    rpcUrl: process.env.RPC_SEPOLIA,
    vaultFactory: '0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C',
    agentRegistry: '0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168',
  },
];

/* ------------------------------------------------------------------ */
/*  ABIs                                                               */
/* ------------------------------------------------------------------ */

const VaultFactoryABI = [
  {
    type: 'function',
    name: 'getAllVaults',
    inputs: [],
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultProtocolType',
    inputs: [{ type: 'address', name: 'vault' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const KernelVaultABI = [
  {
    type: 'function',
    name: 'agentId',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'asset',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalAssets',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalValueLocked',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const ERC20MetadataABI = [
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const;

const PerformanceABI = [
  {
    type: 'function',
    name: 'getPerformanceMetrics',
    inputs: [],
    outputs: [
      { type: 'uint256', name: '_initialPps' },
      { type: 'uint256', name: '_initialPpsTimestamp' },
      { type: 'uint256', name: '_currentPps' },
      { type: 'uint256', name: '_peakPps' },
      { type: 'uint256', name: '_maxDrawdownBps' },
      { type: 'uint256', name: '_executionWins' },
      { type: 'uint256', name: '_totalExecutionCount' },
      { type: 'uint256', name: '_checkpointIndex' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPpsCheckpoints',
    inputs: [],
    outputs: [
      { type: 'uint256[30]', name: 'values' },
      { type: 'uint256[30]', name: 'timestamps' },
      { type: 'uint256', name: 'index' },
    ],
    stateMutability: 'view',
  },
] as const;

const AgentRegistryABI = [
  {
    type: 'function',
    name: 'getMetadataURI',
    inputs: [{ type: 'bytes32', name: 'agentId' }],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface IntentRequest {
  asset: string;
  chainId: number;
  targetApy: number;
  maxDrawdown: number;
  riskTolerance: 'low' | 'medium' | 'high';
  strategyPreference: string[];
  minTvl: number;
}

interface VaultMatch {
  vaultAddress: string;
  chainId: number;
  score: number;
  estimatedApy: number;
  maxDrawdown: number;
  tvl: number;
  agentId: string;
  reasons: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolveUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length);
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return uri;
}

/** Map protocol type number to strategy category */
function protocolToStrategy(protocolType: number): string {
  switch (protocolType) {
    case 1: return 'perp';
    case 2: return 'prediction';
    default: return 'yield';
  }
}

/** Check if vault strategy matches user preferences */
function matchesStrategyPreference(protocolType: number, agentStrategy: string | undefined, preferences: string[]): boolean {
  if (preferences.includes('any') || preferences.length === 0) return true;

  const vaultStrategy = protocolToStrategy(protocolType);

  for (const pref of preferences) {
    if (pref === vaultStrategy) return true;
    // Also match against agent metadata strategy string
    if (agentStrategy) {
      const s = agentStrategy.toLowerCase();
      if (pref === 'yield' && (s.includes('yield') || s.includes('farm') || s.includes('lending'))) return true;
      if (pref === 'perp' && (s.includes('perp') || s.includes('trading') || s.includes('arb'))) return true;
      if (pref === 'prediction' && (s.includes('prediction') || s.includes('market') || s.includes('polymarket'))) return true;
    }
  }
  return false;
}

/** Batch multicall into chunks to avoid RPC size limits */
async function batchedMulticall(client: any, contracts: any[], batchSize = 20): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < contracts.length; i += batchSize) {
    const batch = contracts.slice(i, i + batchSize);
    const batchResults = await client.multicall({ contracts: batch });
    results.push(...batchResults);
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Scoring                                                            */
/* ------------------------------------------------------------------ */

function scoreVault(
  estimatedApy: number,
  maxDrawdown: number,
  tvlUsd: number,
  ageDays: number,
  targetApy: number,
  maxAcceptableDrawdown: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  // 1. APY proximity to target (40% weight)
  let apyScore: number;
  if (estimatedApy >= targetApy) {
    // Exceeds target — full score with slight bonus cap
    apyScore = Math.min(100, 80 + (estimatedApy - targetApy) * 2);
    reasons.push(`APY ${estimatedApy.toFixed(1)}% exceeds target`);
  } else {
    // Below target — proportional
    apyScore = Math.max(0, (estimatedApy / targetApy) * 80);
    if (apyScore > 50) {
      reasons.push(`APY ${estimatedApy.toFixed(1)}% near target`);
    }
  }

  // 2. Drawdown vs max acceptable (30% weight)
  let drawdownScore: number;
  const absDrawdown = Math.abs(maxDrawdown);
  if (absDrawdown <= maxAcceptableDrawdown * 0.5) {
    drawdownScore = 100;
    reasons.push(`Low drawdown (${absDrawdown.toFixed(1)}%)`);
  } else if (absDrawdown <= maxAcceptableDrawdown) {
    drawdownScore = 60 + (1 - absDrawdown / maxAcceptableDrawdown) * 40;
    reasons.push(`Drawdown ${absDrawdown.toFixed(1)}% within limit`);
  } else {
    drawdownScore = Math.max(0, 40 - (absDrawdown - maxAcceptableDrawdown) * 5);
  }

  // 3. TVL confidence (15% weight) — log scale
  let tvlScore: number;
  if (tvlUsd >= 1_000_000) {
    tvlScore = 100;
    reasons.push('High TVL confidence');
  } else if (tvlUsd >= 100_000) {
    tvlScore = 70 + (tvlUsd - 100_000) / 900_000 * 30;
  } else if (tvlUsd >= 10_000) {
    tvlScore = 30 + (tvlUsd - 10_000) / 90_000 * 40;
  } else {
    tvlScore = (tvlUsd / 10_000) * 30;
  }

  // 4. Age / track record (15% weight)
  let ageScore: number;
  if (ageDays >= 90) {
    ageScore = 100;
    reasons.push(`Battle-tested (${Math.floor(ageDays)} days)`);
  } else if (ageDays >= 30) {
    ageScore = 50 + ((ageDays - 30) / 60) * 50;
    reasons.push(`Established (${Math.floor(ageDays)} days)`);
  } else if (ageDays >= 7) {
    ageScore = 20 + ((ageDays - 7) / 23) * 30;
  } else {
    ageScore = (ageDays / 7) * 20;
    if (ageDays < 3) reasons.push('New vault');
  }

  const score = Math.round(
    apyScore * 0.4 +
    drawdownScore * 0.3 +
    tvlScore * 0.15 +
    ageScore * 0.15
  );

  return { score: Math.min(100, Math.max(0, score)), reasons };
}

/* ------------------------------------------------------------------ */
/*  Scan a single chain                                                */
/* ------------------------------------------------------------------ */

async function scanChain(
  config: ChainConfig,
  intent: IntentRequest,
): Promise<{ matches: VaultMatch[]; scanned: number }> {
  if (!config.rpcUrl) {
    return { matches: [], scanned: 0 };
  }

  const client = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  // 1. Get all vault addresses
  let vaultAddresses: `0x${string}`[];
  try {
    vaultAddresses = await client.readContract({
      address: config.vaultFactory,
      abi: VaultFactoryABI,
      functionName: 'getAllVaults',
    }) as `0x${string}`[];
  } catch {
    return { matches: [], scanned: 0 };
  }

  if (vaultAddresses.length === 0) {
    return { matches: [], scanned: 0 };
  }

  // 2. Fetch basic vault data via multicall
  const basicCalls = vaultAddresses.flatMap((addr) => [
    { address: addr, abi: KernelVaultABI, functionName: 'agentId' as const },
    { address: addr, abi: KernelVaultABI, functionName: 'asset' as const },
    { address: addr, abi: KernelVaultABI, functionName: 'totalAssets' as const },
  ]);

  let basicResults: any[];
  try {
    basicResults = await batchedMulticall(client, basicCalls);
  } catch {
    return { matches: [], scanned: vaultAddresses.length };
  }

  // TVL calls
  const tvlCalls = vaultAddresses.map((addr) => ({
    address: addr,
    abi: KernelVaultABI,
    functionName: 'totalValueLocked' as const,
  }));
  let tvlResults: any[] = [];
  try {
    tvlResults = await batchedMulticall(client, tvlCalls);
  } catch {}

  // Protocol type calls
  const protocolCalls = vaultAddresses.map((addr) => ({
    address: config.vaultFactory,
    abi: VaultFactoryABI,
    functionName: 'vaultProtocolType' as const,
    args: [addr] as const,
  }));
  let protocolResults: any[] = [];
  try {
    protocolResults = await batchedMulticall(client, protocolCalls);
  } catch {}

  // ERC-20 metadata
  const metaCalls = vaultAddresses.flatMap((_, i) => {
    const base = i * 3;
    const assetAddr = (basicResults[base + 1]?.result as `0x${string}`) ?? (ZERO_ADDRESS as `0x${string}`);
    return [
      { address: assetAddr, abi: ERC20MetadataABI, functionName: 'decimals' as const },
      { address: assetAddr, abi: ERC20MetadataABI, functionName: 'symbol' as const },
    ];
  });
  let metaResults: any[] = [];
  try {
    metaResults = await batchedMulticall(client, metaCalls);
  } catch {}

  // 3. Performance metrics
  const perfCalls = vaultAddresses.map((addr) => ({
    address: addr,
    abi: PerformanceABI,
    functionName: 'getPerformanceMetrics' as const,
  }));
  let perfResults: any[] = [];
  try {
    perfResults = await batchedMulticall(client, perfCalls);
  } catch {}

  // Checkpoint calls
  const checkpointCalls = vaultAddresses.map((addr) => ({
    address: addr,
    abi: PerformanceABI,
    functionName: 'getPpsCheckpoints' as const,
  }));
  let checkpointResults: any[] = [];
  try {
    checkpointResults = await batchedMulticall(client, checkpointCalls);
  } catch {}

  // 4. Agent metadata URIs (for strategy matching)
  const uniqueAgentIds = new Set<string>();
  for (let i = 0; i < vaultAddresses.length; i++) {
    const base = i * 3;
    const agentId = basicResults[base]?.result as string;
    if (agentId) uniqueAgentIds.add(agentId);
  }

  const agentMeta: Record<string, { strategy?: string }> = {};
  const agentIdArr = [...uniqueAgentIds];
  if (agentIdArr.length > 0) {
    const uriCalls = agentIdArr.map((id) => ({
      address: config.agentRegistry,
      abi: AgentRegistryABI,
      functionName: 'getMetadataURI' as const,
      args: [id] as const,
    }));
    let uriResults: any[] = [];
    try {
      uriResults = await batchedMulticall(client, uriCalls);
    } catch {}

    // Fetch metadata JSON
    const fetchPromises = agentIdArr.map(async (id, i) => {
      const r = uriResults[i];
      if (r?.status !== 'success' || !r.result || r.result === '') return;
      try {
        const url = resolveUri(r.result as string);
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return;
        const json = await resp.json();
        agentMeta[id.toLowerCase()] = { strategy: json.strategy };
      } catch {}
    });
    await Promise.allSettled(fetchPromises);
  }

  // 5. Apply risk tolerance to max drawdown
  let effectiveMaxDrawdown = intent.maxDrawdown;
  if (intent.riskTolerance === 'low') {
    effectiveMaxDrawdown = Math.min(effectiveMaxDrawdown, 3);
  }
  // high = no cap, use as-is

  // 6. Process each vault
  const now = Math.floor(Date.now() / 1000);
  const matches: VaultMatch[] = [];

  for (let i = 0; i < vaultAddresses.length; i++) {
    const base = i * 3;
    const agentId = (basicResults[base]?.result as string) ?? '0x';
    const assetAddr = (basicResults[base + 1]?.result as string) ?? ZERO_ADDRESS;
    const totalAssets = (basicResults[base + 2]?.result as bigint) ?? 0n;

    const tvlRaw = tvlResults[i]?.status === 'success'
      ? (tvlResults[i].result as bigint)
      : totalAssets;

    const isEth = assetAddr === ZERO_ADDRESS;
    const assetDecimals = isEth ? 18 : (metaResults[i * 2]?.status === 'success' ? Number(metaResults[i * 2].result) : 18);
    const assetSymbol = isEth ? 'ETH' : (metaResults[i * 2 + 1]?.status === 'success' ? String(metaResults[i * 2 + 1].result) : 'TOKEN');

    const protocolType = protocolResults[i]?.status === 'success'
      ? Number(protocolResults[i].result)
      : 0;

    // --- Filter: asset ---
    if (intent.asset !== 'any') {
      const normalizedSymbol = assetSymbol.toUpperCase();
      const normalizedIntent = intent.asset.toUpperCase();
      if (normalizedSymbol !== normalizedIntent) continue;
    }

    // --- TVL in USD (approximate: treat token at face value for now) ---
    const tvlNum = Number(tvlRaw) / (10 ** assetDecimals);
    // For non-stablecoin, this is a rough estimate. For USDC/USDT it's accurate.
    // A real implementation would use a price oracle.
    const tvlUsd = tvlNum; // simplified — 1 token ~= 1 USD for stablecoins; for ETH this underestimates

    // --- Filter: minTvl ---
    if (tvlUsd < intent.minTvl) continue;

    // --- Filter: strategy preference ---
    const agentStrategy = agentMeta[agentId.toLowerCase()]?.strategy;
    if (!matchesStrategyPreference(protocolType, agentStrategy, intent.strategyPreference)) continue;

    // --- Compute APY + drawdown from performance metrics ---
    let estimatedApy = 0;
    let vaultMaxDrawdown = 0;
    let ageDays = 0;

    const perf = perfResults[i];
    if (perf?.status === 'success' && perf.result) {
      const [
        initialPps,
        initialPpsTimestamp,
        currentPps,
        ,
        maxDrawdownBps,
        ,
        ,
        ,
      ] = perf.result as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

      // Max drawdown from on-chain bps
      vaultMaxDrawdown = maxDrawdownBps > 0n ? Number(maxDrawdownBps) / 100 : 0;

      // APY calculation
      if (initialPps > 0n && initialPpsTimestamp > 0n) {
        const totalReturn = (Number(currentPps - initialPps) / Number(initialPps)) * 100;
        const elapsedSeconds = now - Number(initialPpsTimestamp);
        ageDays = elapsedSeconds / 86400;

        if (ageDays >= 1) {
          const dailyReturn = totalReturn / 100 / ageDays;
          estimatedApy = ((1 + dailyReturn) ** 365 - 1) * 100;
        }
      }

      // Refine from checkpoints if available
      const cp = checkpointResults[i];
      if (cp?.status === 'success' && cp.result) {
        const [values, timestamps, idx] = cp.result as unknown as [bigint[], bigint[], bigint];
        const count = Number(idx) < 30 ? Number(idx) : 30;
        const thirtyDaysAgo = now - 30 * 86400;

        let closest30d: bigint | null = null;
        let closest30dDist = Infinity;

        for (let j = 0; j < count; j++) {
          const bufIdx = Number(idx) <= 30 ? j : (Number(idx) - 30 + j) % 30;
          const ts = Number(timestamps[bufIdx]);
          const pps = values[bufIdx];
          if (ts === 0 || pps === 0n) continue;

          if (ts <= thirtyDaysAgo) {
            const dist = thirtyDaysAgo - ts;
            if (dist < closest30dDist) {
              closest30dDist = dist;
              closest30d = pps;
            }
          }
        }

        // If we have a 30d checkpoint, use it for a more accurate recent APY
        if (closest30d !== null && closest30d > 0n && perf.result) {
          const currentPps = (perf.result as [bigint, bigint, bigint])[2];
          const thirtyDayReturn = (Number(currentPps - closest30d) / Number(closest30d)) * 100;
          const annualizedFromRecent = ((1 + thirtyDayReturn / 100 / 30) ** 365 - 1) * 100;
          // Blend recent and total — weight recent more
          estimatedApy = annualizedFromRecent * 0.7 + estimatedApy * 0.3;
        }
      }
    }

    // --- Filter: drawdown exceeds risk tolerance for low risk ---
    if (intent.riskTolerance === 'low' && vaultMaxDrawdown > 3) continue;

    // --- Score ---
    const { score, reasons } = scoreVault(
      estimatedApy,
      vaultMaxDrawdown,
      tvlUsd,
      ageDays,
      intent.targetApy,
      effectiveMaxDrawdown,
    );

    matches.push({
      vaultAddress: vaultAddresses[i],
      chainId: config.chainId,
      score,
      estimatedApy: Math.round(estimatedApy * 10) / 10,
      maxDrawdown: Math.round(vaultMaxDrawdown * 10) / 10,
      tvl: Math.round(tvlUsd * 100) / 100,
      agentId,
      reasons,
    });
  }

  return { matches, scanned: vaultAddresses.length };
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  let body: IntentRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  if (typeof body.asset !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid field: asset' }, { status: 400 });
  }
  if (typeof body.targetApy !== 'number' || body.targetApy < 0) {
    return NextResponse.json({ error: 'Missing or invalid field: targetApy' }, { status: 400 });
  }
  if (typeof body.maxDrawdown !== 'number' || body.maxDrawdown < 0) {
    return NextResponse.json({ error: 'Missing or invalid field: maxDrawdown' }, { status: 400 });
  }
  if (!['low', 'medium', 'high'].includes(body.riskTolerance)) {
    return NextResponse.json({ error: 'Missing or invalid field: riskTolerance' }, { status: 400 });
  }

  // Default optional fields
  const intent: IntentRequest = {
    asset: body.asset,
    chainId: body.chainId ?? 0,
    targetApy: body.targetApy,
    maxDrawdown: body.maxDrawdown,
    riskTolerance: body.riskTolerance,
    strategyPreference: body.strategyPreference ?? ['any'],
    minTvl: body.minTvl ?? 0,
  };

  // Determine which chains to scan
  const chainsToScan = intent.chainId === 0
    ? CHAIN_CONFIGS
    : CHAIN_CONFIGS.filter((c) => c.chainId === intent.chainId);

  if (chainsToScan.length === 0) {
    return NextResponse.json(
      { matches: [], totalVaultsScanned: 0 },
      { status: 200 },
    );
  }

  // Scan all chains in parallel
  const results = await Promise.allSettled(
    chainsToScan.map((config) => scanChain(config, intent)),
  );

  let allMatches: VaultMatch[] = [];
  let totalScanned = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allMatches.push(...result.value.matches);
      totalScanned += result.value.scanned;
    }
  }

  // Sort by score descending, take top 5
  allMatches.sort((a, b) => b.score - a.score);
  const topMatches = allMatches.slice(0, 5);

  return NextResponse.json({
    matches: topMatches,
    totalVaultsScanned: totalScanned,
  });
}
