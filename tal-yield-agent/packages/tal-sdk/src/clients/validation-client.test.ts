import { describe, it, expect, beforeEach } from "vitest";
import type { PublicClient, WalletClient } from "viem";
import { ValidationClient } from "./validation-client.js";
import { ValidationModel, ValidationStatus } from "../types.js";
import {
  MOCK_ADDRESSES,
  MOCK_TX_HASH,
  MOCK_REQUEST_HASH,
  MOCK_TASK_HASH,
  MOCK_OUTPUT_HASH,
  MOCK_PAYER,
  MOCK_VALIDATOR,
  createMockPublicClient,
  createMockWalletClient,
} from "../__mocks__/mock-clients.js";

describe("ValidationClient", () => {
  let client: ValidationClient;
  let readOnlyClient: ValidationClient;

  beforeEach(() => {
    client = new ValidationClient({
      publicClient: createMockPublicClient() as PublicClient,
      walletClient: createMockWalletClient() as WalletClient,
      addresses: MOCK_ADDRESSES,
    });

    readOnlyClient = new ValidationClient({
      publicClient: createMockPublicClient() as PublicClient,
      addresses: MOCK_ADDRESSES,
    });
  });

  // ================================================================
  // Read Operations
  // ================================================================
  describe("read operations", () => {
    it("gets validation result", async () => {
      const result = await client.getValidation(MOCK_REQUEST_HASH);
      expect(result.request.agentId).toBe(1n);
      expect(result.request.requester).toBe(MOCK_PAYER);
      expect(result.request.taskHash).toBe(MOCK_TASK_HASH);
      expect(result.request.model).toBe(ValidationModel.StakeSecured);
      expect(result.request.status).toBe(ValidationStatus.Completed);
      expect(result.response.validator).toBe(MOCK_VALIDATOR);
      expect(result.response.score).toBe(95);
    });

    it("gets agent validations", async () => {
      const hashes = await client.getAgentValidations(1n);
      expect(hashes).toContain(MOCK_REQUEST_HASH);
    });

    it("gets validations by requester", async () => {
      const hashes = await client.getValidationsByRequester(MOCK_PAYER);
      expect(hashes).toContain(MOCK_REQUEST_HASH);
    });

    it("gets validations by validator", async () => {
      const hashes = await client.getValidationsByValidator(MOCK_VALIDATOR);
      expect(hashes).toContain(MOCK_REQUEST_HASH);
    });

    it("gets pending validation count", async () => {
      const count = await client.getPendingValidationCount(1n);
      expect(count).toBe(2n);
    });

    it("gets selected validator", async () => {
      const validator = await client.getSelectedValidator(MOCK_REQUEST_HASH);
      expect(validator).toBe(MOCK_VALIDATOR);
    });

    it("checks if disputed", async () => {
      const disputed = await client.isDisputed(MOCK_REQUEST_HASH);
      expect(disputed).toBe(false);
    });
  });

  // ================================================================
  // Write Operations
  // ================================================================
  describe("write operations", () => {
    it("requests validation", async () => {
      const hash = await client.requestValidation(
        1n,
        MOCK_TASK_HASH,
        MOCK_OUTPUT_HASH,
        ValidationModel.StakeSecured,
        1700100000n,
        10000000000000000000n,
      );
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("submits validation", async () => {
      const hash = await client.submitValidation(
        MOCK_REQUEST_HASH,
        95,
        "0x" as `0x${string}`,
        "ipfs://QmResult",
      );
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("disputes validation", async () => {
      const hash = await client.disputeValidation(
        MOCK_REQUEST_HASH,
        "0x1234" as `0x${string}`,
      );
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("throws without wallet client", async () => {
      await expect(
        readOnlyClient.submitValidation(MOCK_REQUEST_HASH, 95, "0x" as `0x${string}`, ""),
      ).rejects.toThrow("WalletClient with account required");
    });
  });
});
