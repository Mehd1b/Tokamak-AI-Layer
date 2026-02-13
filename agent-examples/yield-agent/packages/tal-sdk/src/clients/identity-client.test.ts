import { describe, it, expect, beforeEach } from "vitest";
import type { PublicClient, WalletClient } from "viem";
import { IdentityClient } from "./identity-client.js";
import {
  MOCK_ADDRESSES,
  MOCK_OWNER,
  MOCK_OPERATOR,
  MOCK_TX_HASH,
  MOCK_AGENT_URI,
  createMockPublicClient,
  createMockWalletClient,
} from "../__mocks__/mock-clients.js";

describe("IdentityClient", () => {
  let client: IdentityClient;
  let readOnlyClient: IdentityClient;

  beforeEach(() => {
    client = new IdentityClient({
      publicClient: createMockPublicClient() as PublicClient,
      walletClient: createMockWalletClient() as WalletClient,
      addresses: MOCK_ADDRESSES,
    });

    readOnlyClient = new IdentityClient({
      publicClient: createMockPublicClient() as PublicClient,
      addresses: MOCK_ADDRESSES,
    });
  });

  // ================================================================
  // Read Operations
  // ================================================================
  describe("read operations", () => {
    it("checks if agent exists", async () => {
      const exists = await client.agentExists(1n);
      expect(exists).toBe(true);
    });

    it("gets agent URI", async () => {
      const uri = await client.getAgentURI(1n);
      expect(uri).toBe(MOCK_AGENT_URI);
    });

    it("gets agent count", async () => {
      const count = await client.getAgentCount();
      expect(count).toBe(5n);
    });

    it("gets agents by owner", async () => {
      const agents = await client.getAgentsByOwner(MOCK_OWNER);
      expect(agents).toEqual([1n, 2n]);
    });

    it("gets operator address", async () => {
      const operator = await client.getOperator(1n);
      expect(operator).toBe(MOCK_OPERATOR);
    });

    it("gets owner of agent", async () => {
      const owner = await client.getOwnerOf(1n);
      expect(owner).toBe(MOCK_OWNER);
    });

    it("checks verified operator status", async () => {
      const isVerified = await client.isVerifiedOperator(1n);
      expect(isVerified).toBe(true);
    });

    it("gets full agent info", async () => {
      const info = await client.getAgentInfo(1n);
      expect(info).toEqual({
        agentId: 1n,
        owner: MOCK_OWNER,
        operator: MOCK_OPERATOR,
        uri: MOCK_AGENT_URI,
        isVerifiedOperator: true,
      });
    });
  });

  // ================================================================
  // Write Operations
  // ================================================================
  describe("write operations", () => {
    it("registers an agent", async () => {
      const hash = await client.register("ipfs://QmNew");
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("sets operator", async () => {
      const hash = await client.setOperator(1n, MOCK_OPERATOR);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("updates agent URI", async () => {
      const hash = await client.updateAgentURI(1n, "ipfs://QmUpdated");
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("throws without wallet client", async () => {
      await expect(readOnlyClient.register("ipfs://QmTest")).rejects.toThrow(
        "WalletClient with account required",
      );
    });
  });
});
