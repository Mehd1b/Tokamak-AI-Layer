import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { config, WSTONBondManagerAbi } from '../config.js';
import pino from 'pino';

const logger = pino({ name: 'l1-verifier' });

// Bond status enum matching WSTONBondManager.sol
export enum BondStatus {
  Empty = 0,
  Locked = 1,
  Released = 2,
  Slashed = 3,
}

export interface BondInfo {
  amount: bigint;
  lockedAt: bigint;
  status: BondStatus;
}

export class L1Verifier {
  private client: PublicClient;

  constructor() {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(config.ethRpcUrl),
    });
  }

  /**
   * Query bond status from WSTONBondManager on Ethereum L1
   */
  async getBond(operator: Address, vault: Address, nonce: bigint): Promise<BondInfo> {
    const result = await this.client.readContract({
      address: config.wstonBondManager,
      abi: WSTONBondManagerAbi,
      functionName: 'bonds',
      args: [operator, vault, nonce],
    });

    // result is [amount, lockedAt, status]
    const [amount, lockedAt, status] = result as [bigint, bigint, number];

    return {
      amount,
      lockedAt,
      status: status as BondStatus,
    };
  }

  /**
   * Verify a bond is locked on L1 with the expected amount
   */
  async verifyBondLocked(
    operator: Address,
    vault: Address,
    nonce: bigint,
    expectedAmount: bigint
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      const bond = await this.getBond(operator, vault, nonce);

      if (bond.status !== BondStatus.Locked) {
        return {
          valid: false,
          reason: `Bond status is ${BondStatus[bond.status]} (${bond.status}), expected Locked (1)`,
        };
      }

      if (bond.amount !== expectedAmount) {
        return {
          valid: false,
          reason: `Bond amount ${bond.amount} does not match expected ${expectedAmount}`,
        };
      }

      logger.info(
        {
          operator,
          vault,
          nonce: nonce.toString(),
          amount: bond.amount.toString(),
        },
        'Bond verified as locked on L1'
      );

      return { valid: true };
    } catch (err) {
      logger.error({ err, operator, vault, nonce: nonce.toString() }, 'Failed to verify bond on L1');
      return {
        valid: false,
        reason: `L1 query failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  }
}
