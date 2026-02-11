import type { IProtocolAdapter, IDataSource, PoolData, ChainId } from "../types.js";
import { AaveV3Adapter } from "./aave-v3.js";
import { CompoundV3Adapter } from "./compound-v3.js";
import { UniswapV3Adapter } from "./uniswap-v3.js";
import { CurveAdapter } from "./curve.js";
import { LidoAdapter } from "./lido.js";
import { TokamakStakingAdapter } from "./tokamak-staking.js";
import { createChildLogger } from "../logger.js";

const log = createChildLogger("adapter-registry");

/**
 * Central registry of all protocol adapters.
 * Provides aggregate operations across all protocols.
 */
export class AdapterRegistry {
  private readonly adapters: Map<string, IProtocolAdapter> = new Map();

  constructor(dataSource: IDataSource) {
    const all: IProtocolAdapter[] = [
      new AaveV3Adapter(dataSource),
      new CompoundV3Adapter(dataSource),
      new UniswapV3Adapter(dataSource),
      new CurveAdapter(dataSource),
      new LidoAdapter(dataSource),
      new TokamakStakingAdapter(dataSource),
    ];

    for (const adapter of all) {
      this.adapters.set(adapter.protocolName, adapter);
    }

    log.info(
      { protocols: Array.from(this.adapters.keys()) },
      "Adapter registry initialized",
    );
  }

  getAdapter(protocolName: string): IProtocolAdapter | undefined {
    return this.adapters.get(protocolName);
  }

  getAllAdapters(): IProtocolAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAdapterNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Fetch all pools from all adapters in parallel.
   * Failed adapters are logged but do not block others.
   */
  async getAllPools(): Promise<PoolData[]> {
    const results = await Promise.allSettled(
      this.getAllAdapters().map((adapter) => adapter.getAllPools()),
    );

    const pools: PoolData[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const adapterName = this.getAllAdapters()[i]!.protocolName;

      if (result.status === "fulfilled") {
        pools.push(...result.value);
        log.info(
          { protocol: adapterName, count: result.value.length },
          "Pools fetched",
        );
      } else {
        log.error(
          { protocol: adapterName, error: result.reason },
          "Failed to fetch pools",
        );
      }
    }

    return pools;
  }

  /**
   * Get pools filtered by chain.
   */
  async getPoolsByChain(chain: ChainId): Promise<PoolData[]> {
    const all = await this.getAllPools();
    return all.filter((p) => p.chain === chain);
  }

  /**
   * Get adapter version info for snapshot metadata.
   */
  getVersions(): Record<string, string> {
    const versions: Record<string, string> = {};
    for (const [name] of this.adapters) {
      versions[name] = "1.0.0";
    }
    return versions;
  }
}
