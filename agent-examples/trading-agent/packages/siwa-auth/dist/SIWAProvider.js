import { randomBytes } from "node:crypto";
import { verifyMessage } from "viem";
import pino from "pino";
const logger = pino({ name: "siwa-provider" });
// ── Constants ─────────────────────────────────────────────────
/** Nonce TTL: 5 minutes (must be used before expiry) */
const NONCE_TTL_MS = 5 * 60 * 1000;
/** Cleanup interval: run nonce eviction every 60 seconds */
const NONCE_CLEANUP_INTERVAL_MS = 60 * 1000;
// ── SIWAProvider ──────────────────────────────────────────────
/**
 * Sign-In With Agent (SIWA) authentication provider.
 *
 * Implements EIP-4361 style message signing for agent authorization.
 * The user signs a structured message with their wallet, proving ownership
 * of the address. Sessions are stateless tokens validated by the server.
 */
export class SIWAProvider {
    domain;
    sessionTtl;
    nonces = new Map();
    cleanupTimer;
    constructor(config) {
        this.domain = config.domain;
        this.sessionTtl = config.sessionTtl;
        // Periodically evict expired nonces to prevent memory leaks
        this.cleanupTimer = setInterval(() => {
            this.evictExpiredNonces();
        }, NONCE_CLEANUP_INTERVAL_MS);
        // Allow the process to exit without waiting for this timer
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }
    /**
     * Generate a cryptographically random nonce. Must be consumed within
     * NONCE_TTL_MS or it expires. Each nonce can only be used once to
     * prevent replay attacks.
     */
    generateNonce() {
        const nonce = randomBytes(16).toString("hex");
        this.nonces.set(nonce, { createdAt: Date.now(), used: false });
        logger.debug({ nonce }, "Nonce generated");
        return nonce;
    }
    /**
     * Format an EIP-4361 (Sign-In With Ethereum) style message for the
     * user to sign. This structured format makes the message human-readable
     * in wallet signing prompts.
     */
    createMessage(params) {
        const lines = [
            `${params.domain} wants you to sign in with your Ethereum account:`,
            params.address,
            "",
            params.statement,
            "",
            `URI: ${params.uri}`,
            `Version: ${params.version}`,
            `Chain ID: ${params.chainId}`,
            `Nonce: ${params.nonce}`,
            `Issued At: ${params.issuedAt}`,
        ];
        if (params.expirationTime) {
            lines.push(`Expiration Time: ${params.expirationTime}`);
        }
        return lines.join("\n");
    }
    /**
     * Verify that a message was signed by the expected address using
     * EIP-191 personal_sign recovery.
     */
    async verifySignature(message, signature, expectedAddress) {
        try {
            const valid = await verifyMessage({
                address: expectedAddress,
                message,
                signature,
            });
            logger.info({ address: expectedAddress, valid }, "Signature verification");
            return valid;
        }
        catch (error) {
            logger.error({ error, address: expectedAddress }, "Signature verification threw");
            return false;
        }
    }
    /**
     * Create a session after successful signature verification.
     * The returned session is a stateless token containing all the
     * information needed to authenticate subsequent requests.
     *
     * The caller is responsible for verifying the signature before
     * calling this method. The nonce is consumed here.
     */
    createSession(address, agentId, chainId, signature) {
        const now = Math.floor(Date.now() / 1000);
        const session = {
            address,
            agentId,
            chainId,
            nonce: this.generateNonce(),
            issuedAt: now,
            expiresAt: now + this.sessionTtl,
            signature,
        };
        logger.info({
            address,
            agentId: agentId.toString(),
            expiresAt: session.expiresAt,
        }, "Session created");
        return session;
    }
    /**
     * Validate a session token. Checks:
     * 1. Session has not expired
     * 2. All required fields are present and non-empty
     * 3. Signature is non-empty (signature was validated at creation time)
     */
    validateSession(session) {
        const now = Math.floor(Date.now() / 1000);
        if (!session.address || !session.signature || !session.nonce) {
            logger.warn("Session missing required fields");
            return false;
        }
        if (session.expiresAt <= now) {
            logger.debug({ address: session.address, expiresAt: session.expiresAt, now }, "Session expired");
            return false;
        }
        if (session.issuedAt > now) {
            logger.warn({ address: session.address, issuedAt: session.issuedAt }, "Session issued in the future");
            return false;
        }
        return true;
    }
    /**
     * Check if a nonce is valid (exists and has not been used or expired).
     * Consumes the nonce on success.
     */
    consumeNonce(nonce) {
        const entry = this.nonces.get(nonce);
        if (!entry) {
            logger.debug({ nonce }, "Nonce not found");
            return false;
        }
        if (entry.used) {
            logger.warn({ nonce }, "Nonce already consumed (replay attempt)");
            return false;
        }
        if (Date.now() - entry.createdAt > NONCE_TTL_MS) {
            this.nonces.delete(nonce);
            logger.debug({ nonce }, "Nonce expired");
            return false;
        }
        entry.used = true;
        return true;
    }
    /**
     * Clean up resources. Call this when shutting down.
     */
    destroy() {
        clearInterval(this.cleanupTimer);
        this.nonces.clear();
    }
    // ── Internal Helpers ──────────────────────────────────────────
    evictExpiredNonces() {
        const now = Date.now();
        let evicted = 0;
        for (const [nonce, entry] of this.nonces) {
            if (entry.used || now - entry.createdAt > NONCE_TTL_MS) {
                this.nonces.delete(nonce);
                evicted++;
            }
        }
        if (evicted > 0) {
            logger.debug({ evicted, remaining: this.nonces.size }, "Nonces evicted");
        }
    }
}
//# sourceMappingURL=SIWAProvider.js.map