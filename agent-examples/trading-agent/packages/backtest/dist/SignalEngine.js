import { QuantAnalysis } from "@tal-trading-agent/agent-core";
// ── Technical weights from TokenScorer ──────────────────
// Exact values from agent-core/src/analysis/TokenScorer.ts:12-26
const TECHNICAL_WEIGHTS = {
    priceMomentum: 0.05,
    rsiSignal: 0.04,
    macdSignal: 0.04,
    adxSignal: 0.05,
    aroonSignal: 0.03,
    stochasticRsiSignal: 0.04,
    williamsRSignal: 0.03,
    rocSignal: 0.03,
    atrSignal: 0.03,
    historicalVolSignal: 0.02,
    vwapDeviationSignal: 0.03,
    bollingerPositionSignal: 0.03,
    trendStrengthSignal: 0.05,
};
// Total technical weight for normalization (skip DeFi weights)
const TOTAL_TECH_WEIGHT = Object.values(TECHNICAL_WEIGHTS).reduce((s, w) => s + w, 0);
/**
 * Generates trading signals from price data using the same indicator pipeline
 * as the live agent. Technical signals only (no DeFi metrics available historically).
 * Weights are re-normalized so the output is on [0, 100].
 */
export class SignalEngine {
    quant;
    constructor() {
        this.quant = new QuantAnalysis();
    }
    /**
     * Compute long/short scores for a price window.
     * Uses only the provided lookback prices (no future data).
     */
    computeSignal(prices) {
        if (prices.length < 3) {
            return { longScore: 50, shortScore: 50, indicators: {}, atr: 0 };
        }
        const indicators = this.quant.computeTechnicalIndicators(prices, "1w");
        // ── Long signals (same conversion as TokenScorer) ────
        const longSignals = {
            priceMomentum: momentumToSignal(indicators.momentum),
            rsiSignal: rsiToSignal(indicators.rsi),
            macdSignal: macdToSignal(indicators.macd),
            adxSignal: adxToSignal(indicators.adx),
            aroonSignal: aroonToSignal(indicators.aroon),
            stochasticRsiSignal: stochRsiToSignal(indicators.stochasticRsi),
            williamsRSignal: williamsRToSignal(indicators.williamsR),
            rocSignal: rocToSignal(indicators.roc),
            atrSignal: atrToSignal(indicators.atr),
            historicalVolSignal: hvToSignal(indicators.historicalVolatility),
            vwapDeviationSignal: vwapDeviationToSignal(indicators.vwapDeviation),
            bollingerPositionSignal: bollingerPositionToSignal(indicators.bollingerPosition),
            trendStrengthSignal: Math.min(100, Math.max(0, indicators.trendStrengthComposite)),
        };
        // ── Short signals (inverted) ─────────────────────────
        const shortSignals = {
            priceMomentum: momentumToShortSignal(indicators.momentum),
            rsiSignal: rsiToShortSignal(indicators.rsi),
            macdSignal: macdToShortSignal(indicators.macd),
            adxSignal: adxToShortSignal(indicators.adx),
            aroonSignal: aroonToShortSignal(indicators.aroon),
            stochasticRsiSignal: stochRsiToShortSignal(indicators.stochasticRsi),
            williamsRSignal: williamsRToShortSignal(indicators.williamsR),
            rocSignal: rocToShortSignal(indicators.roc),
            atrSignal: atrToSignal(indicators.atr), // direction-agnostic
            historicalVolSignal: hvToSignal(indicators.historicalVolatility), // direction-agnostic
            vwapDeviationSignal: vwapDeviationToShortSignal(indicators.vwapDeviation),
            bollingerPositionSignal: bollingerPositionToShortSignal(indicators.bollingerPosition),
            trendStrengthSignal: trendStrengthToShortSignal(indicators.trendStrengthComposite),
        };
        // Weighted sum, normalized to [0, 100]
        const longScore = computeWeightedScore(longSignals);
        const shortScore = computeWeightedScore(shortSignals);
        return {
            longScore,
            shortScore,
            indicators: indicators,
            atr: indicators.atr.atr,
        };
    }
}
// ── Weighted score computation ──────────────────────────
function computeWeightedScore(signals) {
    let weighted = 0;
    const weights = TECHNICAL_WEIGHTS;
    for (const [key, value] of Object.entries(signals)) {
        const w = weights[key];
        if (w !== undefined) {
            weighted += value * w;
        }
    }
    // Normalize: divide by total tech weight, then scale to [0, 100]
    const normalized = TOTAL_TECH_WEIGHT > 0 ? (weighted / TOTAL_TECH_WEIGHT) : 50;
    return Math.round(Math.min(100, Math.max(0, normalized)) * 10) / 10;
}
// ── Long Signal Conversions ─────────────────────────────
// Reimplemented from TokenScorer private methods (lines 224-367)
function momentumToSignal(momentum) {
    const clamped = Math.min(20, Math.max(-20, momentum));
    return ((clamped + 20) / 40) * 100;
}
function rsiToSignal(rsi) {
    if (rsi <= 20)
        return 90;
    if (rsi <= 30)
        return 75;
    if (rsi <= 45)
        return 60;
    if (rsi <= 55)
        return 50;
    if (rsi <= 70)
        return 40;
    if (rsi <= 80)
        return 25;
    return 10;
}
function macdToSignal(macd) {
    const normalized = Math.tanh(macd.histogram * 10) * 50 + 50;
    return Math.min(100, Math.max(0, normalized));
}
function adxToSignal(adx) {
    if (adx.adx < 20)
        return 50;
    const trendStrength = Math.min(1, (adx.adx - 20) / 30);
    if (adx.plusDI > adx.minusDI)
        return 50 + trendStrength * 40;
    return 50 - trendStrength * 40;
}
function aroonToSignal(aroon) {
    return (aroon.oscillator + 100) / 2;
}
function stochRsiToSignal(stochRsi) {
    if (stochRsi.k <= 20)
        return 85;
    if (stochRsi.k <= 30)
        return 70;
    if (stochRsi.k <= 70)
        return 50;
    if (stochRsi.k <= 80)
        return 30;
    return 15;
}
function williamsRToSignal(wr) {
    if (wr <= -80)
        return 85;
    if (wr >= -20)
        return 15;
    return 85 - ((wr + 80) / 60) * 70;
}
function rocToSignal(roc) {
    const clamped = Math.min(30, Math.max(-30, roc));
    return ((clamped + 30) / 60) * 100;
}
function atrToSignal(atr) {
    const pct = atr.atrPercent;
    if (pct <= 1)
        return 70;
    if (pct <= 3)
        return 55;
    if (pct <= 5)
        return 40;
    if (pct <= 10)
        return 25;
    return 15;
}
function hvToSignal(hv) {
    const annual = hv.annualizedVol;
    if (annual <= 0.3)
        return 75;
    if (annual <= 0.6)
        return 60;
    if (annual <= 1.0)
        return 40;
    if (annual <= 1.5)
        return 25;
    return 10;
}
function vwapDeviationToSignal(dev) {
    const clamped = Math.min(10, Math.max(-10, dev));
    return ((clamped + 10) / 20) * 100;
}
function bollingerPositionToSignal(bp) {
    let score;
    if (bp.percentB > 1) {
        score = 20;
    }
    else if (bp.percentB < 0) {
        score = 80;
    }
    else {
        score = 70 - bp.percentB * 40;
    }
    if (bp.bandwidth > 0 && bp.bandwidth < 5) {
        score = Math.min(100, score + 10);
    }
    return score;
}
// ── Short Signal Conversions ────────────────────────────
// Reimplemented from TokenScorer private methods (lines 457-604)
function momentumToShortSignal(momentum) {
    const clamped = Math.min(20, Math.max(-20, momentum));
    return ((-clamped + 20) / 40) * 100;
}
function rsiToShortSignal(rsi) {
    if (rsi >= 80)
        return 90;
    if (rsi >= 70)
        return 75;
    if (rsi >= 55)
        return 60;
    if (rsi >= 45)
        return 50;
    if (rsi >= 30)
        return 40;
    if (rsi >= 20)
        return 25;
    return 10;
}
function macdToShortSignal(macd) {
    const normalized = Math.tanh(-macd.histogram * 10) * 50 + 50;
    return Math.min(100, Math.max(0, normalized));
}
function adxToShortSignal(adx) {
    if (adx.adx < 20)
        return 50;
    const trendStrength = Math.min(1, (adx.adx - 20) / 30);
    if (adx.minusDI > adx.plusDI)
        return 50 + trendStrength * 40;
    return 50 - trendStrength * 40;
}
function aroonToShortSignal(aroon) {
    return (-aroon.oscillator + 100) / 2;
}
function stochRsiToShortSignal(stochRsi) {
    if (stochRsi.k >= 80)
        return 85;
    if (stochRsi.k >= 70)
        return 70;
    if (stochRsi.k >= 30)
        return 50;
    if (stochRsi.k >= 20)
        return 30;
    return 15;
}
function williamsRToShortSignal(wr) {
    if (wr >= -20)
        return 85;
    if (wr <= -80)
        return 15;
    return 15 + ((wr + 80) / 60) * 70;
}
function rocToShortSignal(roc) {
    const clamped = Math.min(30, Math.max(-30, roc));
    return ((-clamped + 30) / 60) * 100;
}
function vwapDeviationToShortSignal(dev) {
    const clamped = Math.min(10, Math.max(-10, dev));
    return ((clamped + 10) / 20) * 100;
}
function bollingerPositionToShortSignal(bp) {
    let score;
    if (bp.percentB > 1) {
        score = 80;
    }
    else if (bp.percentB < 0) {
        score = 20;
    }
    else {
        score = 30 + bp.percentB * 40;
    }
    if (bp.bandwidth > 0 && bp.bandwidth < 5) {
        score = Math.min(100, score + 10);
    }
    return score;
}
function trendStrengthToShortSignal(trendStrength) {
    const inverted = -trendStrength;
    return Math.min(100, Math.max(0, inverted));
}
//# sourceMappingURL=SignalEngine.js.map