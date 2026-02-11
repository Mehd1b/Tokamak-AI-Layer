import type {
  IProtocolAdapter,
  IDataSource,
  PoolData,
  APYTimeseries,
  RiskMetrics,
  ChainId,
  ProtocolType,
  DefiLlamaPool,
  AuditInfo,
} from "../types.js";
import {
  DefiLlamaYieldsResponseSchema,
  DefiLlamaChartResponseSchema,
} from "../types.js";
import { createChildLogger } from "../logger.js";

const DEFILLAMA_YIELDS_URL = "https://yields.llama.fi/pools";
const DEFILLAMA_CHART_URL = "https://yields.llama.fi/chart";

/**
 * Base adapter that fetches from DeFi Llama and transforms into PoolData.
 * Subclasses define protocol-specific filtering and risk scoring.
 */
export abstract class BaseDefiLlamaAdapter implements IProtocolAdapter {
  abstract readonly protocolName: string;
  abstract readonly protocolType: ProtocolType;
  abstract readonly supportedChains: readonly ChainId[];

  protected readonly dataSource: IDataSource;
  protected readonly log;

  /** DeFi Llama project identifier (e.g., "aave-v3", "compound-v3") */
  protected abstract readonly defiLlamaProject: string;

  /** Default audit info for this protocol */
  protected abstract readonly defaultAuditInfo: AuditInfo;

  /** Default contract age in days */
  protected abstract readonly defaultContractAge: number;

  constructor(dataSource: IDataSource) {
    this.dataSource = dataSource;
    this.log = createChildLogger(`adapter:${this.constructor.name}`);
  }

  /** Map DeFi Llama chain string to our ChainId */
  protected chainNameToId(chain: string): ChainId | undefined {
    const map: Record<string, ChainId> = {
      Ethereum: 1,
      Optimism: 10,
      Arbitrum: 42161,
      "Tokamak L2": 55004,
    };
    return map[chain];
  }

  /** Compute IL risk from DeFi Llama's il7d field */
  protected computeILRisk(il7d: number): number {
    // Normalize to 0-1 scale: il7d is typically -100 to 0 (percentage loss)
    return Math.min(1, Math.max(0, Math.abs(il7d) / 100));
  }

  /** Transform a DeFi Llama pool into our PoolData format */
  protected transformPool(pool: DefiLlamaPool): PoolData | undefined {
    const chainId = this.chainNameToId(pool.chain);
    if (!chainId) return undefined;
    if (!this.supportedChains.includes(chainId)) return undefined;

    const symbols = pool.symbol.split("-");
    const tokens = symbols.map((s) => ({
      symbol: s,
      address: "0x0000000000000000000000000000000000000000",
      decimals: 18,
      priceUSD: 0,
    }));

    return {
      protocol: this.protocolName,
      protocolType: this.protocolType,
      chain: chainId,
      poolId: pool.pool,
      tokens,
      currentAPY: pool.apy ?? 0,
      tvl: pool.tvlUsd,
      volume24h: pool.volumeUsd1d ?? 0,
      ilRisk: this.computeILRisk(pool.il7d ?? 0),
      protocolRiskScore: this.getDefaultProtocolRisk(),
      auditStatus: this.defaultAuditInfo,
      contractAge: this.defaultContractAge,
    };
  }

  /** Override in subclass for protocol-specific base risk score */
  protected getDefaultProtocolRisk(): number {
    return 30;
  }

  async getPoolData(poolId: string): Promise<PoolData> {
    const pools = await this.getAllPools();
    const pool = pools.find((p) => p.poolId === poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found in ${this.protocolName}`);
    }
    return pool;
  }

  async getAllPools(): Promise<PoolData[]> {
    const response = await this.dataSource.fetch(
      DEFILLAMA_YIELDS_URL,
      DefiLlamaYieldsResponseSchema,
    );

    const filtered = response.data.filter(
      (p) => p.project === this.defiLlamaProject,
    );

    const pools: PoolData[] = [];
    for (const raw of filtered) {
      const transformed = this.transformPool(raw);
      if (transformed) {
        pools.push(transformed);
      }
    }

    this.log.info({ count: pools.length }, "Fetched pools");
    return pools;
  }

  async getHistoricalAPY(
    poolId: string,
    days: number,
  ): Promise<APYTimeseries> {
    const url = `${DEFILLAMA_CHART_URL}/${poolId}`;
    const response = await this.dataSource.fetch(
      url,
      DefiLlamaChartResponseSchema,
    );

    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    const dataPoints = response.data
      .filter((d) => new Date(d.timestamp).getTime() >= cutoff)
      .map((d) => ({
        timestamp: new Date(d.timestamp).getTime(),
        apy: d.apy ?? 0,
      }));

    return {
      poolId,
      protocol: this.protocolName,
      chain: this.supportedChains[0]!,
      dataPoints,
      periodDays: days,
    };
  }

  async getTVL(poolId: string): Promise<number> {
    const pool = await this.getPoolData(poolId);
    return pool.tvl;
  }

  abstract getProtocolRisk(): Promise<RiskMetrics>;
}
