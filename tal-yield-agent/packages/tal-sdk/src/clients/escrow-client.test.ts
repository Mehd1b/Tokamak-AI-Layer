import { describe, it, expect, beforeEach } from "vitest";
import type { PublicClient, WalletClient } from "viem";
import { EscrowClient } from "./escrow-client.js";
import { TaskStatus } from "../types.js";
import {
  MOCK_ADDRESSES,
  MOCK_TX_HASH,
  MOCK_TASK_REF,
  MOCK_PAYER,
  createMockPublicClient,
  createMockWalletClient,
} from "../__mocks__/mock-clients.js";

describe("EscrowClient", () => {
  let client: EscrowClient;
  let readOnlyClient: EscrowClient;

  beforeEach(() => {
    client = new EscrowClient({
      publicClient: createMockPublicClient() as PublicClient,
      walletClient: createMockWalletClient() as WalletClient,
      addresses: MOCK_ADDRESSES,
    });

    readOnlyClient = new EscrowClient({
      publicClient: createMockPublicClient() as PublicClient,
      addresses: MOCK_ADDRESSES,
    });
  });

  // ================================================================
  // Read Operations
  // ================================================================
  describe("read operations", () => {
    it("gets refund deadline", async () => {
      const deadline = await client.getRefundDeadline();
      expect(deadline).toBe(172800n); // 48 hours in seconds
    });

    it("gets agent fee", async () => {
      const fee = await client.getAgentFee(1n);
      expect(fee).toBe(500000000000000000n); // 0.5 TON
    });

    it("gets agent balance", async () => {
      const balance = await client.getAgentBalance(1n);
      expect(balance).toBe(1500000000000000000n); // 1.5 TON
    });

    it("checks if task is paid", async () => {
      const isPaid = await client.isTaskPaid(MOCK_TASK_REF);
      expect(isPaid).toBe(true);
    });

    it("gets task escrow data", async () => {
      const escrow = await client.getTaskEscrow(MOCK_TASK_REF);
      expect(escrow.payer).toBe(MOCK_PAYER);
      expect(escrow.agentId).toBe(1n);
      expect(escrow.amount).toBe(500000000000000000n);
      expect(escrow.status).toBe(TaskStatus.Escrowed);
    });

    it("checks if user has used agent", async () => {
      const hasUsed = await client.hasUsedAgent(1n, MOCK_PAYER);
      expect(hasUsed).toBe(false);
    });
  });

  // ================================================================
  // Write Operations
  // ================================================================
  describe("write operations", () => {
    it("sets agent fee", async () => {
      const hash = await client.setAgentFee(1n, 500000000000000000n);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("pays for task", async () => {
      const hash = await client.payForTask(1n, MOCK_TASK_REF, 500000000000000000n);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("confirms task", async () => {
      const hash = await client.confirmTask(MOCK_TASK_REF);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("refunds task", async () => {
      const hash = await client.refundTask(MOCK_TASK_REF);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("claims fees", async () => {
      const hash = await client.claimFees(1n);
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("throws without wallet client", async () => {
      await expect(readOnlyClient.setAgentFee(1n, 0n)).rejects.toThrow(
        "WalletClient with account required",
      );
    });
  });
});
