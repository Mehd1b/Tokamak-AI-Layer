export async function healthRoutes(app, ctx) {
    app.get("/health", async (_req, reply) => {
        return reply.send({ status: "ok", timestamp: Date.now() });
    });
    app.get("/api/v1/status", async (_req, reply) => {
        return reply.send({
            status: "ok",
            version: "0.1.0",
            agentId: ctx.config.agentId.toString(),
            chainId: ctx.config.chainId,
            uptime: process.uptime(),
            strategies: ctx.strategyCache.size,
            executions: ctx.executionCache.size,
        });
    });
}
//# sourceMappingURL=health.js.map