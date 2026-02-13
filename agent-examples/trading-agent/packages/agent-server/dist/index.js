import "dotenv/config";
import { buildContext } from "./context.js";
import { buildApp } from "./app.js";
async function main() {
    const ctx = await buildContext();
    const app = await buildApp(ctx);
    await app.listen({ port: ctx.config.port, host: ctx.config.host });
    ctx.logger.info({ port: ctx.config.port, host: ctx.config.host }, "TAL Trading Agent started");
}
main().catch((err) => {
    console.error("Fatal error starting server:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map