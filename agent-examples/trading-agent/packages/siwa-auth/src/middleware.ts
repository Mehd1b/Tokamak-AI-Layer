import type { FastifyRequest, FastifyReply } from "fastify";
import pino from "pino";
import type { SIWASession } from "@tal-trading-agent/shared";
import type { SIWAProvider } from "./SIWAProvider.js";

const logger = pino({ name: "siwa-middleware" });

// ── Fastify type augmentation ────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    siwaSession?: SIWASession;
  }
}

// ── JSON reviver for bigint fields ───────────────────────────

/**
 * Custom JSON reviver that restores bigint fields serialized as strings
 * with a "n" suffix (e.g., "123n") or plain numeric strings for known
 * bigint fields.
 */
function reviveBigInts(key: string, value: unknown): unknown {
  if (typeof value === "string") {
    // agentId is a bigint in the SIWASession type
    if (key === "agentId" || key === "amountIn" || key === "amountOut") {
      try {
        return BigInt(value);
      } catch {
        return value;
      }
    }
  }
  return value;
}

// ── Middleware factory ────────────────────────────────────────

/**
 * Create a Fastify preHandler hook that validates SIWA sessions.
 *
 * The client must send the session as a base64-encoded JSON string
 * in the Authorization header:
 *
 *   Authorization: Bearer <base64(JSON.stringify(session))>
 *
 * On success, the decoded SIWASession is attached to `request.siwaSession`.
 * On failure, the middleware replies with 401 Unauthorized.
 */
export function siwaAuthMiddleware(
  provider: SIWAProvider,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      logger.debug({ url: request.url }, "Missing Authorization header");
      reply.code(401).send({
        error: "Unauthorized",
        message: "Missing Authorization header",
      });
      return;
    }

    // Expect "Bearer <base64-encoded-session>"
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
      logger.debug("Malformed Authorization header");
      reply.code(401).send({
        error: "Unauthorized",
        message: "Malformed Authorization header. Expected: Bearer <token>",
      });
      return;
    }

    const token = parts[1];

    // Decode base64 -> JSON -> SIWASession
    let session: SIWASession;
    try {
      const jsonString = Buffer.from(token, "base64").toString("utf-8");
      session = JSON.parse(jsonString, reviveBigInts) as SIWASession;
    } catch (error) {
      logger.debug({ error }, "Failed to decode session token");
      reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid session token encoding",
      });
      return;
    }

    // Validate required fields exist
    if (
      !session.address ||
      !session.signature ||
      !session.nonce ||
      session.agentId === undefined ||
      session.chainId === undefined
    ) {
      logger.debug("Session missing required fields");
      reply.code(401).send({
        error: "Unauthorized",
        message: "Session token missing required fields",
      });
      return;
    }

    // Validate session expiry and integrity
    if (!provider.validateSession(session)) {
      logger.debug(
        { address: session.address },
        "Session validation failed",
      );
      reply.code(401).send({
        error: "Unauthorized",
        message: "Session expired or invalid",
      });
      return;
    }

    // Attach valid session to request
    request.siwaSession = session;

    logger.debug(
      {
        address: session.address,
        agentId: session.agentId.toString(),
      },
      "SIWA session validated",
    );
  };
}
