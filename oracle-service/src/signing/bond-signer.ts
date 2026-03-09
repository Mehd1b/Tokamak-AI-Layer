import {
  type Hex,
  type Address,
  encodePacked,
  keccak256,
  type PrivateKeyAccount,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import pino from 'pino';

const logger = pino({ name: 'bond-signer' });

export class BondSigner {
  private readonly account: PrivateKeyAccount;

  constructor(privateKey: Hex) {
    this.account = privateKeyToAccount(privateKey);
    logger.info({ signer: this.account.address }, 'Bond signer initialized');
  }

  get address(): Address {
    return this.account.address;
  }

  /**
   * Sign a bond lock attestation matching OracleVerifier.requireValidBondAttestation()
   *
   * On-chain format:
   *   bondHash = keccak256(abi.encodePacked("BOND_LOCK_V1", operator, vault, nonce, amount, chainId))
   *   ethSignedHash = keccak256("\x19Ethereum Signed Message:\n32" || bondHash)
   *
   * Types in encodePacked:
   *   "BOND_LOCK_V1" = 12 bytes (string literal)
   *   operator = address = 20 bytes
   *   vault = address = 20 bytes
   *   nonce = uint64 = 8 bytes (NOT 32!)
   *   amount = uint256 = 32 bytes
   *   chainId = uint256 = 32 bytes
   *   Total: 12 + 20 + 20 + 8 + 32 + 32 = 124 bytes
   */
  async signBondAttestation(params: {
    operator: Address;
    vault: Address;
    nonce: bigint;
    amount: bigint;
    chainId: bigint;
  }): Promise<{ attestation: Hex; bondHash: Hex; signer: Address }> {
    // Encode exactly as Solidity abi.encodePacked does
    const bondHash = keccak256(
      encodePacked(
        ['string', 'address', 'address', 'uint64', 'uint256', 'uint256'],
        ['BOND_LOCK_V1', params.operator, params.vault, params.nonce, params.amount, params.chainId]
      )
    );

    // EIP-191 personal sign: viem's signMessage handles the "\x19Ethereum Signed Message:\n32" prefix
    const attestation = await this.account.signMessage({
      message: { raw: bondHash as Hex },
    });

    logger.info(
      {
        operator: params.operator,
        vault: params.vault,
        nonce: params.nonce.toString(),
        bondHash,
      },
      'Bond attestation signed'
    );

    return {
      attestation,
      bondHash,
      signer: this.account.address,
    };
  }
}
