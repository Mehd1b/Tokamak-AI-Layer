import { describe, it, expect, beforeEach } from "vitest";
import type { PublicClient, WalletClient } from "viem";
import { TALClient } from "./tal-client.js";
import { TaskStatus, ValidationModel, ValidationStatus } from "./types.js";
import {
  MOCK_ADDRESSES,
  MOCK_OWNER,
  MOCK_OPERATOR,
  MOCK_TX_HASH,
  MOCK_TASK_REF,
  MOCK_PAYER,
  MOCK_VALIDATOR,
  MOCK_FEEDBACK_HASH,
  MOCK_REQUEST_HASH,
  MOCK_TASK_HASH,
  MOCK_OUTPUT_HASH,
  MOCK_AGENT_URI,
  createMockPublicClient,
  createMockWalletClient,
} from "./__mocks__/mock-clients.js";

describe("TALClient", () => {
  let tal: TALClient;
  let readOnlyTal: TALClient;

  beforeEach(() => {
    tal = new TALClient({
      publicClient: createMockPublicClient() as PublicClient,
      walletClient: createMockWalletClient() as WalletClient,
      addresses: MOCK_ADDRESSES,
    });

    readOnlyTal = new TALClient({
      publicClient: createMockPublicClient() as PublicClient,
      addresses: MOCK_ADDRESSES,
    });
  });

  // ================================================================
  // Construction
  // ================================================================
  describe("construction", () => {
    it("creates with explicit addresses", () => {
      expect(tal.identity).toBeDefined();
      expect(tal.escrow).toBeDefined();
      expect(tal.reputation).toBeDefined();
      expect(tal.validation).toBeDefined();
      expect(tal.staking).toBeDefined();
    });

    it("creates with default addresses when not specified", () => {
      const defaultClient = new TALClient({
        publicClient: createMockPublicClient() as PublicClient,
      });
      expect(defaultClient.identity).toBeDefined();
      expect(defaultClient.escrow).toBeDefined();
      expect(defaultClient.reputation).toBeDefined();
      expect(defaultClient.validation).toBeDefined();
      expect(defaultClient.staking).toBeDefined();
    });

    it("exposes Thanos Sepolia chain info", () => {
      expect(tal.chain.id).toBe(111551119090);
      expect(tal.chain.name).toBe("Thanos Sepolia");
    });
  });

  // ================================================================
  // Identity Shortcuts
  // ================================================================
  describe("identity shortcuts", () => {
    it("registers agent", async () => {
      const hash = await tal.registerAgent("ipfs://QmNew");
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("sets operator", async () => {
      const hash = await tal.setOperator(1n, MOCK_OPERATOR);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("gets agent info", async () => {
      const info = await tal.getAgentInfo(1n);
      expect(info.agentId).toBe(1n);
      expect(info.owner).toBe(MOCK_OWNER);
      expect(info.operator).toBe(MOCK_OPERATOR);
      expect(info.uri).toBe(MOCK_AGENT_URI);
      expect(info.isVerifiedOperator).toBe(true);
    });
  });

  // ================================================================
  // Escrow Shortcuts
  // ================================================================
  describe("escrow shortcuts", () => {
    it("pays for task", async () => {
      const hash = await tal.payForTask(1n, MOCK_TASK_REF, 500000000000000000n);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("confirms task", async () => {
      const hash = await tal.confirmTask(MOCK_TASK_REF);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("claims fees", async () => {
      const hash = await tal.claimFees(1n);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("gets task escrow data", async () => {
      const escrow = await tal.getTaskEscrow(MOCK_TASK_REF);
      expect(escrow.payer).toBe(MOCK_PAYER);
      expect(escrow.agentId).toBe(1n);
      expect(escrow.status).toBe(TaskStatus.Escrowed);
    });
  });

  // ================================================================
  // Reputation Shortcuts
  // ================================================================
  describe("reputation shortcuts", () => {
    it("submits feedback", async () => {
      const hash = await tal.submitFeedback({
        agentId: 1n,
        value: 90n,
        valueDecimals: 0,
        tag1: "accuracy",
        tag2: "prediction",
        endpoint: "/strategy",
        feedbackURI: "ipfs://QmFeedback",
        feedbackHash: MOCK_FEEDBACK_HASH,
      });
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("gets full reputation", async () => {
      const rep = await tal.getReputation(1n);
      expect(rep.feedbackCount).toBe(3n);
      expect(rep.clients).toEqual([MOCK_PAYER]);
      expect(rep.summary.totalValue).toBe(255n);
    });

    it("gets feedback for specific client", async () => {
      const feedback = await tal.getFeedback(1n, MOCK_PAYER);
      expect(feedback).toHaveLength(1);
      expect(feedback[0]!.tag1).toBe("yield-accuracy");
    });
  });

  // ================================================================
  // Validation Shortcuts
  // ================================================================
  describe("validation shortcuts", () => {
    it("gets validation result", async () => {
      const result = await tal.getValidationResult(MOCK_REQUEST_HASH);
      expect(result.request.agentId).toBe(1n);
      expect(result.response.score).toBe(95);
      expect(result.response.validator).toBe(MOCK_VALIDATOR);
    });

    it("submits validation", async () => {
      const hash = await tal.submitValidation(
        MOCK_REQUEST_HASH,
        95,
        "0x" as `0x${string}`,
        "ipfs://QmResult",
      );
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("requests validation", async () => {
      const hash = await tal.requestValidation(
        1n,
        MOCK_TASK_HASH,
        MOCK_OUTPUT_HASH,
        ValidationModel.StakeSecured,
        1700100000n,
        10000000000000000000n,
      );
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("updates APY accuracy", async () => {
      const hash = await tal.updateAPYAccuracy(1n, "task-123", 350n);
      expect(hash).toBe(MOCK_TX_HASH);
    });
  });

  // ================================================================
  // Staking Shortcuts
  // ================================================================
  describe("staking shortcuts", () => {
    it("gets stake balance", async () => {
      const balance = await tal.getStakeBalance(MOCK_OPERATOR);
      expect(balance).toBe(5000000000000000000000n);
    });

    it("gets operator status", async () => {
      const status = await tal.getOperatorStatus(MOCK_OPERATOR);
      expect(status.stakedAmount).toBe(5000000000000000000000n);
      expect(status.isVerified).toBe(true);
    });
  });

  // ================================================================
  // Read-only mode
  // ================================================================
  describe("read-only mode", () => {
    it("reads succeed without wallet", async () => {
      const info = await readOnlyTal.getAgentInfo(1n);
      expect(info.agentId).toBe(1n);
    });

    it("writes fail without wallet", async () => {
      await expect(readOnlyTal.registerAgent("ipfs://test")).rejects.toThrow(
        "WalletClient with account required",
      );
    });
  });
});
