// ── Defaults ────────────────────────────────────────────
export const DEFAULT_STRATEGY_CONFIG = {
    entryThreshold: 62,
    exitThreshold: 40,
    maxPositions: 5,
    useShorts: false,
    shortEntryThreshold: 65,
    shortExitThreshold: 40,
    lookbackBars: 50,
    trendFilter: {
        enabled: false,
        token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        maPeriod: 50,
    },
};
export const DEFAULT_EXECUTION_CONFIG = {
    slippageModel: "fixed",
    fixedSlippageBps: 30,
    swapFeeBps: 30,
    gasPerTradeUsd: 5,
};
export const DEFAULT_RISK_CONFIG = {
    maxPositionPct: 20,
    stopLossAtrMultiple: 2,
    takeProfitAtrMultiple: 4,
    maxDrawdownPct: 25,
    trailingStopPct: null,
};
//# sourceMappingURL=types.js.map