import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createMockContext } from "../__mocks__/mock-context.js";
import { privateKeyToAccount } from "viem/accounts";
import { type Hex } from "viem";

const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const account = privateKeyToAccount(TEST_PRIVATE_KEY);

const domain = {
  name: "TAL Yield Agent",
  version: "1",
  chainId: 111551119090,
} as const;

const types = {
  Request: [
    { name: "action", type: "string" },
    { name: "timestamp", type: "uint256" },
    { name: "requester", type: "address" },
    { name: "params", type: "string" },
  ],
} as const;

describe("EIP-712 Auth Middleware", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = createMockContext();
    ctx.config.EIP712_AUTH = true;
    app = await buildApp(ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects POST /api/v1/strategy/request without signature", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategy/request",
      payload: {
        riskLevel: "moderate",
        capitalUSD: 100_000,
        requester: account.address,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("missing_signature");
  });

  it("rejects stale signature (older than 5 minutes)", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
    const body = {
      riskLevel: "moderate",
      capitalUSD: 100_000,
      requester: account.address,
    };

    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: "Request",
      message: {
        action: "/api/v1/strategy/request",
        timestamp: BigInt(staleTimestamp),
        requester: account.address,
        params: JSON.stringify(body),
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategy/request",
      headers: {
        "x-signature": signature,
        "x-timestamp": String(staleTimestamp),
      },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("expired_signature");
  });

  it("accepts valid EIP-712 signed request", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = {
      riskLevel: "moderate",
      capitalUSD: 100_000,
      requester: account.address,
    };

    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: "Request",
      message: {
        action: "/api/v1/strategy/request",
        timestamp: BigInt(timestamp),
        requester: account.address,
        params: JSON.stringify(body),
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategy/request",
      headers: {
        "x-signature": signature,
        "x-timestamp": String(timestamp),
      },
      payload: body,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("completed");
  });

  it("does not require signature on GET endpoints", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(res.statusCode).toBe(200);
  });
});

describe("Rate Limiting", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = createMockContext();
    app = await buildApp(ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns rate limit headers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
  });
});
