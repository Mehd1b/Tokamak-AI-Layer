import { describe, it, expect, beforeEach } from "vitest";
import type { PublicClient } from "viem";
import { StakingClient } from "./staking-client.js";
import {
  MOCK_ADDRESSES,
  MOCK_OPERATOR,
  createMockPublicClient,
} from "../__mocks__/mock-clients.js";

describe("StakingClient", () => {
  let client: StakingClient;

  beforeEach(() => {
    client = new StakingClient({
      publicClient: createMockPublicClient() as PublicClient,
      addresses: MOCK_ADDRESSES,
    });
  });

  it("gets stake balance", async () => {
    const balance = await client.getStakeBalance(MOCK_OPERATOR);
    expect(balance).toBe(5000000000000000000000n); // 5000 TON
  });

  it("checks if operator is verified", async () => {
    const verified = await client.isVerifiedOperator(MOCK_OPERATOR);
    expect(verified).toBe(true);
  });

  it("gets operator status", async () => {
    const status = await client.getOperatorStatus(MOCK_OPERATOR);
    expect(status.stakedAmount).toBe(5000000000000000000000n);
    expect(status.isVerified).toBe(true);
    expect(status.slashingCount).toBe(0n);
    expect(status.lastSlashTime).toBe(0n);
  });

  it("gets minimum operator stake", async () => {
    const min = await client.getMinOperatorStake();
    expect(min).toBe(1000000000000000000000n); // 1000 TON
  });
});
