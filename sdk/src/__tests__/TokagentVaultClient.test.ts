import { describe, expect, it } from 'vitest';
import { TokagentVaultClient } from '../clients/TokagentVaultClient';
import type { PublicClient } from 'viem';

describe('TokagentVaultClient', () => {
  it('delegates owner() to publicClient.readContract', async () => {
    const calls: unknown[] = [];
    const publicClient = {
      readContract: (args: unknown) => {
        calls.push(args);
        return Promise.resolve('0x1111111111111111111111111111111111111111');
      },
    } as unknown as PublicClient;
    const client = new TokagentVaultClient(
      '0x2222222222222222222222222222222222222222',
      publicClient,
    );
    const owner = await client.owner();
    expect(owner).toBe('0x1111111111111111111111111111111111111111');
    expect(calls).toHaveLength(1);
    expect((calls[0] as { functionName: string }).functionName).toBe('owner');
  });

  it('executeBatch requires walletClient', async () => {
    const publicClient = {
      readContract: () => Promise.resolve('0x0'),
    } as unknown as PublicClient;
    const client = new TokagentVaultClient(
      '0x2222222222222222222222222222222222222222',
      publicClient,
    );
    await expect(
      client.executeBatch([
        { target: '0x3333333333333333333333333333333333333333', data: '0xdeadbeef', value: 0n },
      ]),
    ).rejects.toThrow(/walletClient required/);
  });
});
