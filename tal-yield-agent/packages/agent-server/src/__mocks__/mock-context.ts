import { SnapshotManager, StrategyGenerator, RiskScorer, APYPredictor } from "@tal-yield-agent/agent-core";
import type { DataSnapshot, PoolData } from "@tal-yield-agent/agent-core";
import { THANOS_SEPOLIA_ADDRESSES } from "@tal-yield-agent/shared";
import type { AppContext, TaskRecord } from "../context.js";
import type { Config } from "../config.js";
import pino from "pino";

// ============================================================
// Mock Pool Data
// ============================================================

export function makeMockPool(overrides: Partial<PoolData> = {}): PoolData {
  return {
    protocol: "Aave V3",
    protocolType: "lending",
    chain: 1,
    poolId: "aave-v3-eth-usdc",
    tokens: [{ symbol: "USDC", address: "0x0", decimals: 6, priceUSD: 1 }],
    currentAPY: 3.5,
    tvl: 2_500_000_000,
    volume24h: 150_000_000,
    ilRisk: 0,
    protocolRiskScore: 15,
    auditStatus: {
      audited: true,
      auditors: ["OZ"],
      auditCount: 12,
      bugBountyActive: true,
      bugBountySize: 10_000_000,
    },
    contractAge: 900,
    ...overrides,
  };
}

export function makeMockSnapshot(pools: PoolData[]): DataSnapshot {
  const mgr = new SnapshotManager();
  return mgr.createSnapshot({
    poolStates: pools,
    priceFeed: { USDC: 1, ETH: 3000, WETH: 3000 },
    blockNumbers: { "1": 19000000 },
    timestamp: 1700000000,
    sources: ["mock"],
    fetchDuration: 10,
    adapterVersions: { mock: "1.0.0" },
  });
}

// ============================================================
// Mock Pipeline (avoids real HTTP calls)
// ============================================================

class MockPipeline {
  private readonly pools: PoolData[];
  private lastSnapshot: DataSnapshot | null = null;

  constructor(pools: PoolData[]) {
    this.pools = pools;
  }

  async createSnapshot(): Promise<DataSnapshot> {
    const snapshot = makeMockSnapshot(this.pools);
    this.lastSnapshot = snapshot;
    return snapshot;
  }

  getLastSnapshot(): DataSnapshot | null {
    return this.lastSnapshot;
  }
}

// ============================================================
// Create Mock Context
// ============================================================

export function createMockContext(
  overrides: Partial<AppContext> = {},
  pools?: PoolData[],
): AppContext {
  const defaultPools = pools ?? [
    makeMockPool({ poolId: "aave-usdc", protocol: "Aave V3", currentAPY: 3.5, tvl: 2_500_000_000 }),
    makeMockPool({ poolId: "comp-usdc", protocol: "Compound V3", currentAPY: 3.1, tvl: 1_800_000_000, protocolRiskScore: 18 }),
    makeMockPool({ poolId: "lido-steth", protocol: "Lido", currentAPY: 3.2, tvl: 14_000_000_000, protocolType: "liquid-staking", protocolRiskScore: 12 }),
  ];

  const config: Config = {
    PORT: 3000,
    HOST: "0.0.0.0",
    RPC_URL: "https://rpc.thanos-sepolia.tokamak.network",
    IDENTITY_REGISTRY: THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
    REPUTATION_REGISTRY: THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry,
    VALIDATION_REGISTRY: THANOS_SEPOLIA_ADDRESSES.TALValidationRegistry,
    TASK_FEE_ESCROW: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
    STAKING_INTEGRATION_MODULE: THANOS_SEPOLIA_ADDRESSES.StakingIntegrationModule,
    AGENT_ID: 1n,
    OPERATOR_PRIVATE_KEY: undefined,
    REDIS_URL: "redis://localhost:6379",
    IPFS_GATEWAY: "https://gateway.pinata.cloud",
    API_KEYS: "",
    EIP712_AUTH: false,
    LOG_LEVEL: "silent" as "info",
  };

  return {
    config,
    logger: pino({ level: "silent" }),
    pipeline: new MockPipeline(defaultPools) as unknown as AppContext["pipeline"],
    snapshotManager: new SnapshotManager(),
    strategyGenerator: new StrategyGenerator(new RiskScorer(), new APYPredictor()),
    talClient: {} as AppContext["talClient"],
    snapshotCache: new Map(),
    taskCache: new Map(),
    poolCache: defaultPools,
    ...overrides,
  };
}
