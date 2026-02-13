import { describe, it, expect, beforeEach } from "vitest";
import { AaveV3Adapter } from "./aave-v3.js";
import { CompoundV3Adapter } from "./compound-v3.js";
import { UniswapV3Adapter } from "./uniswap-v3.js";
import { CurveAdapter } from "./curve.js";
import { LidoAdapter } from "./lido.js";
import { TokamakStakingAdapter } from "./tokamak-staking.js";
import { AdapterRegistry } from "./adapter-registry.js";
import { MockDataSource } from "../__mocks__/mock-data-source.js";

// ================================================================
// Aave V3 Adapter
// ================================================================
describe("AaveV3Adapter", () => {
  let adapter: AaveV3Adapter;
  let dataSource: MockDataSource;

  beforeEach(() => {
    dataSource = new MockDataSource();
    adapter = new AaveV3Adapter(dataSource);
  });

  it("has correct protocol metadata", () => {
    expect(adapter.protocolName).toBe("Aave V3");
    expect(adapter.protocolType).toBe("lending");
    expect(adapter.supportedChains).toEqual([1, 10, 42161]);
  });

  it("fetches all pools and filters by project", async () => {
    const pools = await adapter.getAllPools();
    expect(pools.length).toBeGreaterThan(0);
    expect(pools.every((p) => p.protocol === "Aave V3")).toBe(true);
  });

  it("only includes supported chains (no Polygon)", async () => {
    const pools = await adapter.getAllPools();
    const chains = new Set(pools.map((p) => p.chain));
    expect(chains.has(1)).toBe(true);     // Ethereum
    expect(chains.has(42161)).toBe(true);  // Arbitrum
    expect(chains.has(10)).toBe(true);     // Optimism
    // Polygon pool should be filtered out
    expect(pools.some((p) => p.poolId === "aave-v3-polygon-usdc")).toBe(false);
  });

  it("transforms pool data correctly", async () => {
    const pools = await adapter.getAllPools();
    const ethUsdc = pools.find((p) => p.poolId === "aave-v3-eth-usdc");
    expect(ethUsdc).toBeDefined();
    expect(ethUsdc!.currentAPY).toBe(3.45);
    expect(ethUsdc!.tvl).toBe(2_500_000_000);
    expect(ethUsdc!.volume24h).toBe(150_000_000);
    expect(ethUsdc!.ilRisk).toBe(0); // no IL for lending
    expect(ethUsdc!.protocolRiskScore).toBe(15);
    expect(ethUsdc!.auditStatus.audited).toBe(true);
    expect(ethUsdc!.auditStatus.auditCount).toBe(12);
  });

  it("gets individual pool by ID", async () => {
    const pool = await adapter.getPoolData("aave-v3-eth-usdc");
    expect(pool.poolId).toBe("aave-v3-eth-usdc");
    expect(pool.protocol).toBe("Aave V3");
  });

  it("throws for non-existent pool", async () => {
    await expect(adapter.getPoolData("nonexistent")).rejects.toThrow(
      "Pool nonexistent not found",
    );
  });

  it("gets TVL for a pool", async () => {
    const tvl = await adapter.getTVL("aave-v3-eth-usdc");
    expect(tvl).toBe(2_500_000_000);
  });

  it("gets historical APY", async () => {
    const history = await adapter.getHistoricalAPY("aave-v3-eth-usdc", 30);
    expect(history.poolId).toBe("aave-v3-eth-usdc");
    expect(history.protocol).toBe("Aave V3");
    expect(history.periodDays).toBe(30);
    expect(history.dataPoints.length).toBeGreaterThan(0);
    expect(history.dataPoints[0]!.apy).toBeTypeOf("number");
  });

  it("returns correct protocol risk metrics", async () => {
    const risk = await adapter.getProtocolRisk();
    expect(risk.overallScore).toBe(15);
    expect(risk.smartContractRisk).toBeLessThanOrEqual(100);
    expect(risk.marketRisk).toBeLessThanOrEqual(100);
  });
});

// ================================================================
// Compound V3 Adapter
// ================================================================
describe("CompoundV3Adapter", () => {
  let adapter: CompoundV3Adapter;

  beforeEach(() => {
    adapter = new CompoundV3Adapter(new MockDataSource());
  });

  it("has correct metadata", () => {
    expect(adapter.protocolName).toBe("Compound V3");
    expect(adapter.protocolType).toBe("lending");
    expect(adapter.supportedChains).toEqual([1]);
  });

  it("fetches Compound pools", async () => {
    const pools = await adapter.getAllPools();
    expect(pools.every((p) => p.protocol === "Compound V3")).toBe(true);
    expect(pools.length).toBe(1);
    expect(pools[0]!.currentAPY).toBe(3.12);
  });

  it("returns protocol risk", async () => {
    const risk = await adapter.getProtocolRisk();
    expect(risk.overallScore).toBe(18);
  });
});

// ================================================================
// Uniswap V3 Adapter
// ================================================================
describe("UniswapV3Adapter", () => {
  let adapter: UniswapV3Adapter;

  beforeEach(() => {
    adapter = new UniswapV3Adapter(new MockDataSource());
  });

  it("has correct metadata", () => {
    expect(adapter.protocolName).toBe("Uniswap V3");
    expect(adapter.protocolType).toBe("amm");
    expect(adapter.supportedChains).toEqual([1, 10, 42161]);
  });

  it("fetches pools with IL risk", async () => {
    const pools = await adapter.getAllPools();
    expect(pools.length).toBeGreaterThan(0);

    const ethPool = pools.find((p) => p.poolId === "uniswap-v3-eth-usdc-weth");
    expect(ethPool).toBeDefined();
    expect(ethPool!.ilRisk).toBeGreaterThan(0); // Should have IL risk
    expect(ethPool!.currentAPY).toBe(12.5);
  });

  it("computes IL risk correctly", async () => {
    const pools = await adapter.getAllPools();
    const arbPool = pools.find((p) => p.poolId === "uniswap-v3-arb-usdc-weth");
    expect(arbPool).toBeDefined();
    // il7d = -3.1 => ilRisk = 3.1/100 = 0.031
    expect(arbPool!.ilRisk).toBeCloseTo(0.031, 3);
  });
});

// ================================================================
// Curve Adapter
// ================================================================
describe("CurveAdapter", () => {
  let adapter: CurveAdapter;

  beforeEach(() => {
    adapter = new CurveAdapter(new MockDataSource());
  });

  it("has correct metadata", () => {
    expect(adapter.protocolName).toBe("Curve");
    expect(adapter.protocolType).toBe("stableswap");
    expect(adapter.supportedChains).toEqual([1]);
  });

  it("fetches Curve pools with low IL", async () => {
    const pools = await adapter.getAllPools();
    expect(pools.length).toBe(1);
    const pool = pools[0]!;
    expect(pool.currentAPY).toBe(2.1);
    expect(pool.ilRisk).toBeLessThan(0.01); // Very low for stableswaps
  });
});

// ================================================================
// Lido Adapter
// ================================================================
describe("LidoAdapter", () => {
  let adapter: LidoAdapter;

  beforeEach(() => {
    adapter = new LidoAdapter(new MockDataSource());
  });

  it("has correct metadata", () => {
    expect(adapter.protocolName).toBe("Lido");
    expect(adapter.protocolType).toBe("liquid-staking");
  });

  it("fetches Lido stETH pool", async () => {
    const pools = await adapter.getAllPools();
    expect(pools.length).toBe(1);
    expect(pools[0]!.currentAPY).toBe(3.2);
    expect(pools[0]!.tvl).toBe(14_000_000_000);
  });

  it("has very low risk score", async () => {
    const risk = await adapter.getProtocolRisk();
    expect(risk.overallScore).toBeLessThan(20);
  });
});

// ================================================================
// Tokamak Staking Adapter
// ================================================================
describe("TokamakStakingAdapter", () => {
  let adapter: TokamakStakingAdapter;

  beforeEach(() => {
    adapter = new TokamakStakingAdapter(new MockDataSource());
  });

  it("has correct metadata", () => {
    expect(adapter.protocolName).toBe("Tokamak Staking");
    expect(adapter.protocolType).toBe("staking");
    expect(adapter.supportedChains).toEqual([55004]);
  });

  it("fetches Tokamak staking pools", async () => {
    const pools = await adapter.getAllPools();
    expect(pools.length).toBe(1);
    expect(pools[0]!.currentAPY).toBe(5.5);
    expect(pools[0]!.chain).toBe(55004);
  });

  it("has higher risk score for newer protocol", async () => {
    const risk = await adapter.getProtocolRisk();
    expect(risk.overallScore).toBeGreaterThan(30);
  });
});

// ================================================================
// Adapter Registry
// ================================================================
describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;
  let dataSource: MockDataSource;

  beforeEach(() => {
    dataSource = new MockDataSource();
    registry = new AdapterRegistry(dataSource);
  });

  it("registers all 6 adapters", () => {
    const names = registry.getAdapterNames();
    expect(names).toHaveLength(6);
    expect(names).toContain("Aave V3");
    expect(names).toContain("Compound V3");
    expect(names).toContain("Uniswap V3");
    expect(names).toContain("Curve");
    expect(names).toContain("Lido");
    expect(names).toContain("Tokamak Staking");
  });

  it("gets adapter by name", () => {
    const aave = registry.getAdapter("Aave V3");
    expect(aave).toBeDefined();
    expect(aave!.protocolName).toBe("Aave V3");
  });

  it("returns undefined for unknown adapter", () => {
    expect(registry.getAdapter("Unknown")).toBeUndefined();
  });

  it("fetches all pools from all adapters", async () => {
    const pools = await registry.getAllPools();
    expect(pools.length).toBeGreaterThan(5);

    // Should have pools from multiple protocols
    const protocols = new Set(pools.map((p) => p.protocol));
    expect(protocols.size).toBeGreaterThanOrEqual(5);
  });

  it("filters pools by chain", async () => {
    const ethPools = await registry.getPoolsByChain(1);
    expect(ethPools.every((p) => p.chain === 1)).toBe(true);
    expect(ethPools.length).toBeGreaterThan(0);
  });

  it("returns version info", () => {
    const versions = registry.getVersions();
    expect(Object.keys(versions)).toHaveLength(6);
    expect(versions["Aave V3"]).toBe("1.0.0");
  });

  it("handles adapter failure gracefully", async () => {
    // Override one adapter to fail
    const failingSource = new MockDataSource();
    failingSource.setResponse("https://yields.llama.fi/pools", { status: "success", data: [] });
    const reg = new AdapterRegistry(failingSource);

    // Should still work, just with empty results
    const pools = await reg.getAllPools();
    expect(Array.isArray(pools)).toBe(true);
  });
});
