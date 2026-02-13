import { Type } from "@sinclair/typebox";
import { isAddress } from "viem";
const VerifyBody = Type.Object({
    message: Type.String(),
    signature: Type.String(),
    address: Type.String(),
    agentId: Type.Optional(Type.String()),
    chainId: Type.Optional(Type.Number()),
});
export async function authRoutes(app, ctx) {
    // ── GET /api/v1/auth/nonce ─────────────────────────────
    app.get("/api/v1/auth/nonce", async (_req, reply) => {
        const nonce = ctx.siwaProvider.generateNonce();
        return reply.send({
            nonce,
            domain: ctx.config.siwaDomain,
            expiresIn: ctx.config.siwaSessionTtl,
        });
    });
    // ── POST /api/v1/auth/verify ───────────────────────────
    app.post("/api/v1/auth/verify", { schema: { body: VerifyBody } }, async (req, reply) => {
        const { message, signature, address, agentId, chainId } = req.body;
        if (!isAddress(address)) {
            return reply.code(400).send({ error: "Invalid address" });
        }
        // Verify the signature
        const valid = await ctx.siwaProvider.verifySignature(message, signature, address);
        if (!valid) {
            return reply.code(401).send({ error: "Invalid signature" });
        }
        // Create session
        const session = ctx.siwaProvider.createSession(address, BigInt(agentId ?? "0"), chainId ?? 1, signature);
        // Encode session as base64 for use as Bearer token
        const token = Buffer.from(JSON.stringify(session, (_key, value) => typeof value === "bigint" ? value.toString() : value)).toString("base64");
        return reply.send({
            authenticated: true,
            token,
            expiresAt: session.expiresAt,
            address: session.address,
        });
    });
    // ── POST /api/v1/auth/refresh ──────────────────────────
    app.post("/api/v1/auth/refresh", async (req, reply) => {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return reply.code(401).send({ error: "Missing Authorization header" });
        }
        try {
            const jsonString = Buffer.from(authHeader.slice(7), "base64").toString("utf-8");
            const oldSession = JSON.parse(jsonString, (_key, value) => {
                if (_key === "agentId" && typeof value === "string") {
                    return BigInt(value);
                }
                return value;
            });
            if (!ctx.siwaProvider.validateSession(oldSession)) {
                return reply.code(401).send({ error: "Session expired or invalid" });
            }
            // Create new session with extended TTL
            const newSession = ctx.siwaProvider.createSession(oldSession.address, oldSession.agentId, oldSession.chainId, oldSession.signature);
            const token = Buffer.from(JSON.stringify(newSession, (_key, value) => typeof value === "bigint" ? value.toString() : value)).toString("base64");
            return reply.send({
                refreshed: true,
                token,
                expiresAt: newSession.expiresAt,
            });
        }
        catch {
            return reply.code(401).send({ error: "Invalid session token" });
        }
    });
}
//# sourceMappingURL=auth.js.map