import type { Address, Hex } from "viem";
import type { SIWASession, SIWAMessageParams } from "@tal-trading-agent/shared";
/**
 * Sign-In With Agent (SIWA) authentication provider.
 *
 * Implements EIP-4361 style message signing for agent authorization.
 * The user signs a structured message with their wallet, proving ownership
 * of the address. Sessions are stateless tokens validated by the server.
 */
export declare class SIWAProvider {
    private readonly domain;
    private readonly sessionTtl;
    private readonly nonces;
    private readonly cleanupTimer;
    constructor(config: {
        domain: string;
        sessionTtl: number;
    });
    /**
     * Generate a cryptographically random nonce. Must be consumed within
     * NONCE_TTL_MS or it expires. Each nonce can only be used once to
     * prevent replay attacks.
     */
    generateNonce(): string;
    /**
     * Format an EIP-4361 (Sign-In With Ethereum) style message for the
     * user to sign. This structured format makes the message human-readable
     * in wallet signing prompts.
     */
    createMessage(params: SIWAMessageParams): string;
    /**
     * Verify that a message was signed by the expected address using
     * EIP-191 personal_sign recovery.
     */
    verifySignature(message: string, signature: Hex, expectedAddress: Address): Promise<boolean>;
    /**
     * Create a session after successful signature verification.
     * The returned session is a stateless token containing all the
     * information needed to authenticate subsequent requests.
     *
     * The caller is responsible for verifying the signature before
     * calling this method. The nonce is consumed here.
     */
    createSession(address: Address, agentId: bigint, chainId: number, signature: Hex): SIWASession;
    /**
     * Validate a session token. Checks:
     * 1. Session has not expired
     * 2. All required fields are present and non-empty
     * 3. Signature is non-empty (signature was validated at creation time)
     */
    validateSession(session: SIWASession): boolean;
    /**
     * Check if a nonce is valid (exists and has not been used or expired).
     * Consumes the nonce on success.
     */
    consumeNonce(nonce: string): boolean;
    /**
     * Clean up resources. Call this when shutting down.
     */
    destroy(): void;
    private evictExpiredNonces;
}
//# sourceMappingURL=SIWAProvider.d.ts.map