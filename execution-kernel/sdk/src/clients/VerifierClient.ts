import type { PublicClient } from 'viem';
import { KernelExecutionVerifierABI } from '../abi/KernelExecutionVerifier';
import type { ParsedJournal } from '../types';

export class VerifierClient {
  private readonly publicClient: PublicClient;
  private readonly address: `0x${string}`;

  constructor(publicClient: PublicClient, address: `0x${string}`) {
    this.publicClient = publicClient;
    this.address = address;
  }

  async verifyAndParse(
    expectedImageId: `0x${string}`,
    journal: `0x${string}`,
    seal: `0x${string}`,
  ): Promise<ParsedJournal> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: KernelExecutionVerifierABI,
      functionName: 'verifyAndParseWithImageId',
      args: [expectedImageId, journal, seal],
    });
    return {
      agentId: result.agentId,
      agentCodeHash: result.agentCodeHash,
      constraintSetHash: result.constraintSetHash,
      inputRoot: result.inputRoot,
      executionNonce: result.executionNonce,
      inputCommitment: result.inputCommitment,
      actionCommitment: result.actionCommitment,
    };
  }

  async parseJournal(journal: `0x${string}`): Promise<ParsedJournal> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: KernelExecutionVerifierABI,
      functionName: 'parseJournal',
      args: [journal],
    });
    return {
      agentId: result.agentId,
      agentCodeHash: result.agentCodeHash,
      constraintSetHash: result.constraintSetHash,
      inputRoot: result.inputRoot,
      executionNonce: result.executionNonce,
      inputCommitment: result.inputCommitment,
      actionCommitment: result.actionCommitment,
    };
  }
}
