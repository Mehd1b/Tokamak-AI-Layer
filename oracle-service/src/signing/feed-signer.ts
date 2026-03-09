import {
  type Hex,
  type Address,
  encodePacked,
  keccak256,
  type PrivateKeyAccount,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import pino from 'pino';

const logger = pino({ name: 'feed-signer' });

export class FeedSigner {
  private readonly account: PrivateKeyAccount;

  constructor(privateKey: Hex) {
    this.account = privateKeyToAccount(privateKey);
    logger.info({ signer: this.account.address }, 'Feed signer initialized');
  }

  get address(): Address {
    return this.account.address;
  }

  /**
   * Sign a price feed attestation matching OracleVerifier.requireValidOracleSignature()
   *
   * On-chain format:
   *   domainFeedHash = keccak256(abi.encodePacked(feedHash, oracleTimestamp, chainId, vaultAddress))
   *   ethSignedHash = keccak256("\x19Ethereum Signed Message:\n32" || domainFeedHash)
   *
   * Types in encodePacked:
   *   feedHash = bytes32 = 32 bytes
   *   oracleTimestamp = uint64 = 8 bytes (NOT 32!)
   *   chainId = uint256 = 32 bytes
   *   vaultAddress = address = 20 bytes
   *   Total: 32 + 8 + 32 + 20 = 92 bytes
   */
  async signFeed(params: {
    feedHash: Hex;
    timestamp: bigint;
    chainId: bigint;
    vaultAddress: Address;
  }): Promise<{ signature: Hex; signer: Address }> {
    const domainFeedHash = keccak256(
      encodePacked(
        ['bytes32', 'uint64', 'uint256', 'address'],
        [params.feedHash, params.timestamp, params.chainId, params.vaultAddress]
      )
    );

    // EIP-191 personal sign
    const signature = await this.account.signMessage({
      message: { raw: domainFeedHash as Hex },
    });

    logger.info(
      {
        feedHash: params.feedHash,
        timestamp: params.timestamp.toString(),
        vaultAddress: params.vaultAddress,
      },
      'Feed signature created'
    );

    return {
      signature,
      signer: this.account.address,
    };
  }
}
