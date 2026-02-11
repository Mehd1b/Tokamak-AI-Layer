import { keccak256, toHex } from "viem";
import type { PoolData, DataSnapshot, APYTimeseries } from "../types.js";
import type {
  RiskProfile,
  StrategyReport,
  Allocation,
  ScoredPool,
  AlternativeStrategy,
  RiskScore,
  APYPrediction,
} from "./types.js";
import { RiskScorer } from "./risk-scorer.js";
import { APYPredictor } from "./apy-predictor.js";
import { ExecutionTracer } from "./execution-trace.js";

/**
 * Deterministic strategy generator.
 *
 * Pipeline:
 * 1. Filter pools by RiskProfile constraints
 * 2. Score each pool's risk
 * 3. Predict each pool's future APY
 * 4. Compute risk-adjusted return
 * 5. Optimize allocation (Markowitz-style mean-variance)
 * 6. Apply diversification constraints
 * 7. Generate strategy report with execution hash
 */
export class StrategyGenerator {
  private readonly riskScorer: RiskScorer;
  private readonly apyPredictor: APYPredictor;

  constructor(
    riskScorer?: RiskScorer,
    apyPredictor?: APYPredictor,
  ) {
    this.riskScorer = riskScorer ?? new RiskScorer();
    this.apyPredictor = apyPredictor ?? new APYPredictor();
  }

  /**
   * Generate a full strategy report from a data snapshot.
   *
   * All operations are deterministic given the same snapshot + profile.
   */
  generate(
    snapshot: DataSnapshot,
    riskProfile: RiskProfile,
    capitalUSD: number,
    requestId: string,
    historyMap?: Map<string, APYTimeseries>,
  ): StrategyReport {
    const tracer = new ExecutionTracer();
    const warnings: string[] = [];
    const reasoning: string[] = [];

    // Step 1: Filter pools
    const start1 = Date.now();
    const eligiblePools = this.filterPools(snapshot.poolStates, riskProfile);
    tracer.recordStep("filter_pools", { poolCount: snapshot.poolStates.length, riskProfile }, { eligibleCount: eligiblePools.length }, Date.now() - start1);
    reasoning.push(`Filtered ${snapshot.poolStates.length} pools → ${eligiblePools.length} eligible for ${riskProfile.level} profile`);

    if (eligiblePools.length === 0) {
      warnings.push("No pools match the given risk profile constraints");
    }

    // Step 2: Score risk for each pool
    const start2 = Date.now();
    const riskScores = new Map<string, RiskScore>();
    for (const pool of eligiblePools) {
      riskScores.set(pool.poolId, this.riskScorer.scorePool(pool));
    }
    tracer.recordStep("score_risk", { poolIds: eligiblePools.map((p) => p.poolId) }, { scores: Object.fromEntries(riskScores.entries()) }, Date.now() - start2);

    // Step 3: Predict APY for each pool
    const start3 = Date.now();
    const predictions = new Map<string, APYPrediction>();
    for (const pool of eligiblePools) {
      const history = historyMap?.get(pool.poolId);
      const prediction = history
        ? this.apyPredictor.predict(pool, history)
        : this.apyPredictor.predictFromCurrent(pool);
      predictions.set(pool.poolId, prediction);
    }
    tracer.recordStep("predict_apy", { poolIds: eligiblePools.map((p) => p.poolId) }, { predictions: Object.fromEntries(predictions.entries()) }, Date.now() - start3);

    // Step 4: Compute risk-adjusted return
    const start4 = Date.now();
    const scoredPools: ScoredPool[] = eligiblePools.map((pool) => {
      const riskScore = riskScores.get(pool.poolId)!;
      const prediction = predictions.get(pool.poolId)!;
      const riskAdjustedReturn = prediction.predicted30d.mean * (1 - riskScore.overall / 100);
      return { pool, riskScore, prediction, riskAdjustedReturn };
    });

    // Sort by risk-adjusted return (descending)
    scoredPools.sort((a, b) => b.riskAdjustedReturn - a.riskAdjustedReturn);
    tracer.recordStep("rank_pools", { count: scoredPools.length }, { top: scoredPools.slice(0, 5).map((s) => ({ pool: s.pool.poolId, rar: s.riskAdjustedReturn })) }, Date.now() - start4);

    reasoning.push(
      `Top pools by risk-adjusted return: ${scoredPools
        .slice(0, 3)
        .map((s) => `${s.pool.protocol}/${s.pool.poolId} (${s.riskAdjustedReturn.toFixed(2)}%)`)
        .join(", ")}`,
    );

    // Step 5: Optimize allocation with diversification constraints
    const start5 = Date.now();
    const allocations = this.optimizeAllocation(scoredPools, riskProfile, capitalUSD);
    tracer.recordStep("optimize_allocation", { poolCount: scoredPools.length, capitalUSD }, { allocationCount: allocations.length }, Date.now() - start5);

    reasoning.push(`Allocated across ${allocations.length} pools with max ${(riskProfile.maxSinglePoolAllocation * 100).toFixed(0)}% per pool`);

    // Step 6: Compute blended APY
    const blendedAPY = this.computeBlendedAPY(allocations);
    reasoning.push(`Blended expected APY: ${blendedAPY.blended.toFixed(2)}% (range: ${blendedAPY.range.low.toFixed(2)}% - ${blendedAPY.range.high.toFixed(2)}%)`);

    // Step 7: Compute overall risk score
    const overallRisk = this.computeOverallRisk(allocations, riskScores);

    // Step 8: Generate alternatives
    const alternatives = this.generateAlternatives(scoredPools, riskProfile, capitalUSD);

    // Finalize execution trace
    const pipelineInput = { snapshotId: snapshot.snapshotId, riskProfile, capitalUSD };
    const pipelineOutput = { allocations, blendedAPY, overallRisk };
    const trace = tracer.finalize(pipelineInput, pipelineOutput);

    const reportId = keccak256(toHex(JSON.stringify({ requestId, snapshotId: snapshot.snapshotId, timestamp: snapshot.timestamp })));

    return {
      reportId,
      requestId,
      snapshotId: snapshot.snapshotId,
      timestamp: snapshot.timestamp,
      riskProfile,
      capitalUSD,
      allocations,
      expectedAPY: blendedAPY,
      riskScore: overallRisk,
      reasoning,
      alternativesConsidered: alternatives,
      warnings,
      executionHash: trace.executionHash,
    };
  }

  /**
   * Filter pools by risk profile constraints.
   */
  private filterPools(pools: PoolData[], profile: RiskProfile): PoolData[] {
    return pools.filter((pool) => {
      // IL tolerance
      if (pool.ilRisk > profile.maxILTolerance) return false;

      // Min TVL
      if (pool.tvl < profile.minTVL) return false;

      // Min protocol age
      if (pool.contractAge < profile.minProtocolAge) return false;

      // Chain preferences (empty = all chains)
      if (
        profile.chainPreferences.length > 0 &&
        !profile.chainPreferences.includes(pool.chain)
      ) {
        return false;
      }

      // Excluded protocols
      if (profile.excludeProtocols.includes(pool.protocol)) return false;

      return true;
    });
  }

  /**
   * Markowitz-inspired allocation optimization with constraints.
   *
   * Simple greedy approach: allocate to top pools by risk-adjusted return,
   * respecting max per-pool and per-protocol limits.
   */
  private optimizeAllocation(
    scoredPools: ScoredPool[],
    profile: RiskProfile,
    capitalUSD: number,
  ): Allocation[] {
    if (scoredPools.length === 0) return [];

    const allocations: Allocation[] = [];
    let remainingPct = 1.0;
    const protocolAllocations = new Map<string, number>();
    const maxPerProtocol = Math.min(0.6, profile.maxSinglePoolAllocation * 2);

    for (const scored of scoredPools) {
      if (remainingPct <= 0.01) break; // Less than 1% remaining

      // Check per-protocol limit
      const protocolPct = protocolAllocations.get(scored.pool.protocol) ?? 0;
      if (protocolPct >= maxPerProtocol) continue;

      // Compute allocation for this pool
      const maxPoolPct = Math.min(
        profile.maxSinglePoolAllocation,
        remainingPct,
        maxPerProtocol - protocolPct,
      );

      // Allocate proportionally to risk-adjusted return
      const pct = Math.min(maxPoolPct, remainingPct);
      if (pct < 0.05) continue; // Skip allocations under 5%

      allocations.push({
        protocol: scored.pool.protocol,
        pool: scored.pool.poolId,
        chain: scored.pool.chain,
        percentage: Number(pct.toFixed(4)),
        amountUSD: Number((capitalUSD * pct).toFixed(2)),
        expectedAPY: scored.prediction,
        riskScore: scored.riskScore.overall,
      });

      remainingPct -= pct;
      protocolAllocations.set(
        scored.pool.protocol,
        protocolPct + pct,
      );
    }

    // Normalize allocations if they don't sum to 100% and we have allocations
    if (allocations.length > 0 && remainingPct > 0.01) {
      const totalPct = allocations.reduce((s, a) => s + a.percentage, 0);
      for (const alloc of allocations) {
        alloc.percentage = Number((alloc.percentage / totalPct).toFixed(4));
        alloc.amountUSD = Number((capitalUSD * alloc.percentage).toFixed(2));
      }
    }

    return allocations;
  }

  /**
   * Compute blended APY across allocations.
   */
  private computeBlendedAPY(allocations: Allocation[]): {
    blended: number;
    range: { low: number; high: number };
  } {
    if (allocations.length === 0) {
      return { blended: 0, range: { low: 0, high: 0 } };
    }

    let blended = 0;
    let low = 0;
    let high = 0;

    for (const alloc of allocations) {
      blended += alloc.percentage * alloc.expectedAPY.predicted30d.mean;
      low += alloc.percentage * alloc.expectedAPY.predicted30d.low;
      high += alloc.percentage * alloc.expectedAPY.predicted30d.high;
    }

    return {
      blended: Number(blended.toFixed(4)),
      range: {
        low: Number(low.toFixed(4)),
        high: Number(high.toFixed(4)),
      },
    };
  }

  /**
   * Compute portfolio-level risk score from weighted allocation risks.
   */
  private computeOverallRisk(
    allocations: Allocation[],
    riskScores: Map<string, RiskScore>,
  ): RiskScore {
    if (allocations.length === 0) {
      return {
        overall: 0,
        breakdown: {
          smartContractRisk: 0,
          marketRisk: 0,
          liquidityRisk: 0,
          protocolRisk: 0,
          impermanentLoss: 0,
          regulatoryRisk: 0,
        },
        confidence: 0,
      };
    }

    let weightedOverall = 0;
    let weightedConfidence = 0;
    const weightedBreakdown = {
      smartContractRisk: 0,
      marketRisk: 0,
      liquidityRisk: 0,
      protocolRisk: 0,
      impermanentLoss: 0,
      regulatoryRisk: 0,
    };

    for (const alloc of allocations) {
      const score = riskScores.get(alloc.pool);
      if (!score) continue;

      weightedOverall += alloc.percentage * score.overall;
      weightedConfidence += alloc.percentage * score.confidence;
      weightedBreakdown.smartContractRisk += alloc.percentage * score.breakdown.smartContractRisk;
      weightedBreakdown.marketRisk += alloc.percentage * score.breakdown.marketRisk;
      weightedBreakdown.liquidityRisk += alloc.percentage * score.breakdown.liquidityRisk;
      weightedBreakdown.protocolRisk += alloc.percentage * score.breakdown.protocolRisk;
      weightedBreakdown.impermanentLoss += alloc.percentage * score.breakdown.impermanentLoss;
      weightedBreakdown.regulatoryRisk += alloc.percentage * score.breakdown.regulatoryRisk;
    }

    return {
      overall: Number(weightedOverall.toFixed(2)),
      breakdown: {
        smartContractRisk: Number(weightedBreakdown.smartContractRisk.toFixed(2)),
        marketRisk: Number(weightedBreakdown.marketRisk.toFixed(2)),
        liquidityRisk: Number(weightedBreakdown.liquidityRisk.toFixed(2)),
        protocolRisk: Number(weightedBreakdown.protocolRisk.toFixed(2)),
        impermanentLoss: Number(weightedBreakdown.impermanentLoss.toFixed(2)),
        regulatoryRisk: Number(weightedBreakdown.regulatoryRisk.toFixed(2)),
      },
      confidence: Number(weightedConfidence.toFixed(2)),
    };
  }

  /**
   * Generate alternative strategy suggestions.
   */
  private generateAlternatives(
    scoredPools: ScoredPool[],
    profile: RiskProfile,
    capitalUSD: number,
  ): AlternativeStrategy[] {
    const alternatives: AlternativeStrategy[] = [];

    if (scoredPools.length === 0) return alternatives;

    // Alternative 1: Safest pools only
    const safestPools = [...scoredPools].sort((a, b) => a.riskScore.overall - b.riskScore.overall);
    const safeAllocs = this.optimizeAllocation(safestPools.slice(0, 3), profile, capitalUSD);
    if (safeAllocs.length > 0) {
      const safeAPY = safeAllocs.reduce((s, a) => s + a.percentage * a.expectedAPY.predicted30d.mean, 0);
      alternatives.push({
        name: "safety_first",
        blendedAPY: Number(safeAPY.toFixed(4)),
        riskScore: safestPools[0]!.riskScore.overall,
        reason: "Prioritizes lowest-risk pools at the cost of yield",
      });
    }

    // Alternative 2: Highest yield (aggressive)
    const highYieldPools = [...scoredPools].sort(
      (a, b) => b.prediction.predicted30d.mean - a.prediction.predicted30d.mean,
    );
    const yieldAllocs = this.optimizeAllocation(highYieldPools.slice(0, 3), profile, capitalUSD);
    if (yieldAllocs.length > 0) {
      const yieldAPY = yieldAllocs.reduce((s, a) => s + a.percentage * a.expectedAPY.predicted30d.mean, 0);
      alternatives.push({
        name: "max_yield",
        blendedAPY: Number(yieldAPY.toFixed(4)),
        riskScore: highYieldPools[0]!.riskScore.overall,
        reason: "Maximizes yield without regard to risk-adjusted return",
      });
    }

    return alternatives;
  }
}
