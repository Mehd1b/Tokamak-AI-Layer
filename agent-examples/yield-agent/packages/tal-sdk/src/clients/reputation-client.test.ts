import { describe, it, expect, beforeEach } from "vitest";
import type { PublicClient, WalletClient } from "viem";
import { ReputationClient } from "./reputation-client.js";
import {
  MOCK_ADDRESSES,
  MOCK_TX_HASH,
  MOCK_PAYER,
  MOCK_FEEDBACK_HASH,
  MOCK_FEEDBACK_ENTRY,
  createMockPublicClient,
  createMockWalletClient,
} from "../__mocks__/mock-clients.js";

describe("ReputationClient", () => {
  let client: ReputationClient;
  let readOnlyClient: ReputationClient;

  beforeEach(() => {
    client = new ReputationClient({
      publicClient: createMockPublicClient() as PublicClient,
      walletClient: createMockWalletClient() as WalletClient,
      addresses: MOCK_ADDRESSES,
    });

    readOnlyClient = new ReputationClient({
      publicClient: createMockPublicClient() as PublicClient,
      addresses: MOCK_ADDRESSES,
    });
  });

  // ================================================================
  // Read Operations
  // ================================================================
  describe("read operations", () => {
    it("gets feedback for agent + client", async () => {
      const feedback = await client.getFeedback(1n, MOCK_PAYER);
      expect(feedback).toHaveLength(1);
      expect(feedback[0]!.value).toBe(85n);
      expect(feedback[0]!.tag1).toBe("yield-accuracy");
      expect(feedback[0]!.isRevoked).toBe(false);
    });

    it("gets feedback count", async () => {
      const count = await client.getFeedbackCount(1n);
      expect(count).toBe(3n);
    });

    it("gets client list", async () => {
      const clients = await client.getClientList(1n);
      expect(clients).toEqual([MOCK_PAYER]);
    });

    it("gets feedback summary", async () => {
      const summary = await client.getSummary(1n, [MOCK_PAYER]);
      expect(summary.totalValue).toBe(255n);
      expect(summary.count).toBe(3n);
      expect(summary.min).toBe(75n);
      expect(summary.max).toBe(95n);
    });

    it("gets stake-weighted summary", async () => {
      const summary = await client.getStakeWeightedSummary(1n, [MOCK_PAYER]);
      expect(summary.weightedTotalValue).toBe(850n);
      expect(summary.totalWeight).toBe(10000n);
      expect(summary.count).toBe(3n);
    });

    it("gets full reputation", async () => {
      const rep = await client.getFullReputation(1n);
      expect(rep.feedbackCount).toBe(3n);
      expect(rep.clients).toEqual([MOCK_PAYER]);
      expect(rep.summary.totalValue).toBe(255n);
    });
  });

  // ================================================================
  // Write Operations
  // ================================================================
  describe("write operations", () => {
    it("submits feedback", async () => {
      const hash = await client.submitFeedback({
        agentId: 1n,
        value: 90n,
        valueDecimals: 0,
        tag1: "yield-accuracy",
        tag2: "prediction",
        endpoint: "/strategy",
        feedbackURI: "ipfs://QmFeedback",
        feedbackHash: MOCK_FEEDBACK_HASH,
      });
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("responds to feedback", async () => {
      const hash = await client.respondToFeedback(
        1n,
        MOCK_PAYER,
        0n,
        "ipfs://QmResponse",
      );
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("throws without wallet client", async () => {
      await expect(
        readOnlyClient.submitFeedback({
          agentId: 1n,
          value: 90n,
          valueDecimals: 0,
          tag1: "",
          tag2: "",
          endpoint: "",
          feedbackURI: "",
          feedbackHash: MOCK_FEEDBACK_HASH,
        }),
      ).rejects.toThrow("WalletClient with account required");
    });
  });
});
