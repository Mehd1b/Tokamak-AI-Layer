import type { FastifyRequest, FastifyReply } from "fastify";
import type { SIWASession } from "@tal-trading-agent/shared";
import type { SIWAProvider } from "./SIWAProvider.js";
declare module "fastify" {
    interface FastifyRequest {
        siwaSession?: SIWASession;
    }
}
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
export declare function siwaAuthMiddleware(provider: SIWAProvider): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=middleware.d.ts.map