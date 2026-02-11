import type { PoolData } from "../types.js";
import type { RiskScore, RiskBreakdown } from "./types.js";

/**
 * Deterministic risk scorer for DeFi pools.
 *
 * Composite score (0-100) from weighted factors:
 * - Smart contract risk: 0-25 (audit count, age, bug bounty)
 * - Market risk: 0-20 (token volatility proxy via APY variance)
 * - Liquidity risk: 0-20 (TVL depth)
 * - Protocol risk: 0-15 (governance/centralization proxy)
 * - Impermanent loss: 0-15 (historical IL estimation)
 * - Regulatory risk: 0-5 (heuristic based on token type)
 */
export class RiskScorer {
  /**
   * Score a single pool. All inputs are deterministic given the same PoolData.
   */
  scorePool(pool: PoolData): RiskScore {
    const breakdown = this.computeBreakdown(pool);
    const overall =
      breakdown.smartContractRisk +
      breakdown.marketRisk +
      breakdown.liquidityRisk +
      breakdown.protocolRisk +
      breakdown.impermanentLoss +
      breakdown.regulatoryRisk;

    const confidence = this.computeConfidence(pool);

    return { overall, breakdown, confidence };
  }

  private computeBreakdown(pool: PoolData): RiskBreakdown {
    return {
      smartContractRisk: this.scoreSmartContract(pool),
      marketRisk: this.scoreMarket(pool),
      liquidityRisk: this.scoreLiquidity(pool),
      protocolRisk: this.scoreProtocol(pool),
      impermanentLoss: this.scoreIL(pool),
      regulatoryRisk: this.scoreRegulatory(pool),
    };
  }

  /**
   * Smart contract risk (0-25): lower score = safer
   * Based on: audit count, contract age, bug bounty
   */
  private scoreSmartContract(pool: PoolData): number {
    const maxScore = 25;
    let risk = maxScore;

    // Audit bonus: each audit reduces risk by 2, capped
    if (pool.auditStatus.audited) {
      risk -= Math.min(10, pool.auditStatus.auditCount * 2);
    }

    // Age bonus: older contracts = less risk
    // 730+ days = -8, 365 days = -4, 90 days = -1, <30 days = 0
    const ageDays = pool.contractAge;
    if (ageDays >= 730) risk -= 8;
    else if (ageDays >= 365) risk -= 4 + Math.floor((ageDays - 365) / 91);
    else if (ageDays >= 90) risk -= 1 + Math.floor((ageDays - 90) / 91);

    // Bug bounty bonus
    if (pool.auditStatus.bugBountyActive) {
      const bountyTier =
        pool.auditStatus.bugBountySize >= 10_000_000 ? 5 :
        pool.auditStatus.bugBountySize >= 1_000_000 ? 3 :
        pool.auditStatus.bugBountySize >= 100_000 ? 1 : 0;
      risk -= bountyTier;
    }

    return Math.max(0, Math.min(maxScore, risk));
  }

  /**
   * Market risk (0-20): proxy via APY variance and current APY level
   * Very high APY = likely high token emission = high market risk
   */
  private scoreMarket(pool: PoolData): number {
    const maxScore = 20;

    // High APY signals volatile reward tokens
    const apyRisk =
      pool.currentAPY > 50 ? 15 :
      pool.currentAPY > 20 ? 10 :
      pool.currentAPY > 10 ? 6 :
      pool.currentAPY > 5 ? 3 : 1;

    // Single-asset pools (staking, lending) have lower market risk
    const tokenCount = pool.tokens.length;
    const diversityPenalty = tokenCount > 2 ? 3 : tokenCount > 1 ? 1 : 0;

    return Math.min(maxScore, apyRisk + diversityPenalty);
  }

  /**
   * Liquidity risk (0-20): based on TVL depth and volume
   */
  private scoreLiquidity(pool: PoolData): number {
    const maxScore = 20;

    // TVL tiers
    const tvlRisk =
      pool.tvl >= 1_000_000_000 ? 2 :
      pool.tvl >= 500_000_000 ? 4 :
      pool.tvl >= 100_000_000 ? 8 :
      pool.tvl >= 10_000_000 ? 12 : 16;

    // Volume/TVL ratio indicates activity (higher = better liquidity)
    const volumeRatio = pool.volume24h / Math.max(pool.tvl, 1);
    const volumeBonus =
      volumeRatio > 0.1 ? -4 :
      volumeRatio > 0.01 ? -2 : 0;

    return Math.max(0, Math.min(maxScore, tvlRisk + volumeBonus));
  }

  /**
   * Protocol risk (0-15): proxy based on protocolRiskScore
   */
  private scoreProtocol(pool: PoolData): number {
    // Map 0-100 protocol risk score to 0-15 range
    return Math.round((pool.protocolRiskScore / 100) * 15);
  }

  /**
   * Impermanent loss risk (0-15): from pool's ilRisk field
   */
  private scoreIL(pool: PoolData): number {
    // ilRisk is 0-1, map to 0-15
    return Math.round(pool.ilRisk * 15);
  }

  /**
   * Regulatory risk (0-5): heuristic based on pool type
   */
  private scoreRegulatory(pool: PoolData): number {
    // Stablecoins/staking = lower regulatory risk
    if (pool.protocolType === "staking" || pool.protocolType === "liquid-staking") {
      return 1;
    }
    if (pool.protocolType === "stableswap") {
      return 2;
    }
    if (pool.protocolType === "lending") {
      return 2;
    }
    // AMM/LP = moderate
    return 3;
  }

  /**
   * Confidence score (0-1): how reliable is our risk assessment
   */
  private computeConfidence(pool: PoolData): number {
    let confidence = 0.5;

    // Audited protocols get higher confidence
    if (pool.auditStatus.audited) {
      confidence += 0.15;
    }

    // Older protocols get higher confidence
    if (pool.contractAge >= 365) confidence += 0.15;
    else if (pool.contractAge >= 180) confidence += 0.1;

    // Higher TVL = more data = more confidence
    if (pool.tvl >= 1_000_000_000) confidence += 0.15;
    else if (pool.tvl >= 100_000_000) confidence += 0.1;

    return Math.min(1, confidence);
  }
}
