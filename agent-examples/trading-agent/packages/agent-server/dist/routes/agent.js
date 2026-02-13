export async function agentRoutes(app, ctx) {
    // ── GET /api/v1/agent/info ─────────────────────────────
    app.get("/api/v1/agent/info", async (_req, reply) => {
        if (ctx.config.agentId === 0n) {
            return reply.send({
                registered: false,
                message: "Agent not registered. Run: pnpm register",
            });
        }
        try {
            const info = await ctx.talIntegration.getAgentInfo(ctx.config.agentId);
            return reply.send({
                registered: true,
                agentId: ctx.config.agentId.toString(),
                owner: info.owner,
                agentURI: info.agentURI,
                operator: info.operator,
            });
        }
        catch (error) {
            ctx.logger.error({ error }, "Failed to fetch agent info");
            return reply.code(500).send({ error: "Failed to fetch agent info" });
        }
    });
    // ── GET /api/v1/agent/reputation ───────────────────────
    app.get("/api/v1/agent/reputation", async (_req, reply) => {
        if (ctx.config.agentId === 0n) {
            return reply.send({ feedbackCount: "0", averageScore: 0 });
        }
        try {
            const rep = await ctx.talIntegration.getReputation(ctx.config.agentId);
            return reply.send({
                agentId: ctx.config.agentId.toString(),
                feedbackCount: rep.feedbackCount.toString(),
                averageScore: rep.averageScore,
            });
        }
        catch (error) {
            ctx.logger.error({ error }, "Failed to fetch reputation");
            return reply.code(500).send({ error: "Failed to fetch reputation" });
        }
    });
    // ── GET /api/v1/agent/stats ────────────────────────────
    app.get("/api/v1/agent/stats", async (_req, reply) => {
        const executions = [...ctx.executionCache.values()];
        const completed = executions.filter((e) => e.status === "confirmed");
        const failed = executions.filter((e) => e.status === "failed");
        return reply.send({
            totalStrategies: ctx.strategyCache.size,
            totalExecutions: executions.length,
            completedExecutions: completed.length,
            failedExecutions: failed.length,
            successRate: executions.length > 0
                ? completed.length / executions.length
                : 0,
        });
    });
    // ── GET /api/v1/agent/capabilities ─────────────────────
    app.get("/api/v1/agent/capabilities", async (_req, reply) => {
        return reply.send({
            name: "TAL Trading Agent",
            version: "0.1.0",
            capabilities: [
                {
                    id: "trade-analysis",
                    name: "Trade Analysis",
                    description: "Analyzes DEX pools and generates quantitative trading strategies",
                    endpoint: "POST /api/v1/trade/analyze",
                },
                {
                    id: "trade-execution",
                    name: "Trade Execution",
                    description: "Executes approved strategies via signed transactions",
                    endpoint: "POST /api/v1/trade/execute",
                },
                {
                    id: "bot-download",
                    name: "Bot Download",
                    description: "Download a self-contained trading bot zip for a strategy",
                    endpoint: "GET /api/v1/trade/:strategyId/download",
                },
            ],
            supportedChains: [1],
            supportedDexes: ["Uniswap V3"],
            authMethod: "SIWA (Sign-In With Agent)",
        });
    });
}
//# sourceMappingURL=agent.js.map