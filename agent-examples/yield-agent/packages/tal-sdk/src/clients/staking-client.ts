import type { Address, PublicClient } from "viem";
import { StakingIntegrationModuleABI } from "@tal-yield-agent/shared";
import type { TALClientConfig, OperatorStatus } from "../types.js";

/**
 * Read-only client for StakingIntegrationModule.
 *
 * The actual stake/unstake operations happen on L1 via TALStakingBridgeL1.
 * This module only queries cached L2 stake data and operator status.
 */
export class StakingClient {
  private readonly publicClient: PublicClient;
  private readonly address: Address;

  constructor(config: TALClientConfig) {
    this.publicClient = config.publicClient;
    this.address = config.addresses.stakingIntegrationModule;
  }

  async getStakeBalance(operator: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: StakingIntegrationModuleABI,
      functionName: "getStake",
      args: [operator],
    });
  }

  async isVerifiedOperator(operator: Address): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.address,
      abi: StakingIntegrationModuleABI,
      functionName: "isVerifiedOperator",
      args: [operator],
    });
  }

  async getOperatorStatus(operator: Address): Promise<OperatorStatus> {
    const [stakedAmount, isVerified, slashingCount, lastSlashTime] =
      await this.publicClient.readContract({
        address: this.address,
        abi: StakingIntegrationModuleABI,
        functionName: "getOperatorStatus",
        args: [operator],
      });

    return { stakedAmount, isVerified, slashingCount, lastSlashTime };
  }

  async getMinOperatorStake(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: StakingIntegrationModuleABI,
      functionName: "MIN_OPERATOR_STAKE",
    });
  }
}
