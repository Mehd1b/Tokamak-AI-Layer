import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyTypedData, type Address, type Hex } from "viem";

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

const domain = {
  name: "TAL Yield Agent",
  version: "1",
  chainId: 111551119090, // Thanos Sepolia
} as const;

const types = {
  Request: [
    { name: "action", type: "string" },
    { name: "timestamp", type: "uint256" },
    { name: "requester", type: "address" },
    { name: "params", type: "string" },
  ],
} as const;

export interface EIP712Message {
  action: string;
  timestamp: bigint;
  requester: Address;
  params: string;
}

/**
 * Fastify preHandler hook that verifies EIP-712 signed requests.
 *
 * Required headers:
 *   x-signature: hex-encoded EIP-712 signature
 *   x-timestamp: unix timestamp (seconds) when the signature was created
 *
 * The `requester` field in the request body must match the recovered signer.
 */
export async function verifyEIP712Signature(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const signature = req.headers["x-signature"] as string | undefined;
  const timestampHeader = req.headers["x-timestamp"] as string | undefined;

  if (!signature || !timestampHeader) {
    return reply.code(401).send({
      error: "missing_signature",
      message: "x-signature and x-timestamp headers are required",
    });
  }

  const timestamp = Number(timestampHeader);
  if (Number.isNaN(timestamp)) {
    return reply.code(401).send({
      error: "invalid_timestamp",
      message: "x-timestamp must be a valid unix timestamp in seconds",
    });
  }

  // Reject stale signatures
  const ageMs = Date.now() - timestamp * 1000;
  if (ageMs > SIGNATURE_MAX_AGE_MS) {
    return reply.code(401).send({
      error: "expired_signature",
      message: "Signature is older than 5 minutes",
    });
  }

  const body = req.body as Record<string, unknown> | undefined;
  const requester = (body?.requester ?? body?.validator) as string | undefined;
  if (!requester) {
    return reply.code(400).send({
      error: "missing_requester",
      message: "Request body must contain a requester or validator field",
    });
  }

  const action = req.url;
  const paramsStr = JSON.stringify(body);

  const message: EIP712Message = {
    action,
    timestamp: BigInt(timestamp),
    requester: requester as Address,
    params: paramsStr,
  };

  try {
    const valid = await verifyTypedData({
      address: requester as Address,
      domain,
      types,
      primaryType: "Request",
      message,
      signature: signature as Hex,
    });

    if (!valid) {
      return reply.code(401).send({
        error: "invalid_signature",
        message: "EIP-712 signature verification failed",
      });
    }
  } catch {
    return reply.code(401).send({
      error: "invalid_signature",
      message: "EIP-712 signature verification failed",
    });
  }
}
