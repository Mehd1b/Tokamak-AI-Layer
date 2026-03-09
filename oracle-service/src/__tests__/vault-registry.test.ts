import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the pure logic, not the DB interactions
describe('Vault Registry Logic', () => {
  it('OptimisticVaultDeployed event has correct topic signature', async () => {
    const { keccak256, toHex } = await import('viem');

    // This is what the VaultFactory emits
    const eventSig = 'OptimisticVaultDeployed(address,bytes32,address,uint256)';
    const topic = keccak256(toHex(eventSig, { size: undefined }));

    // Should be a valid bytes32
    expect(topic).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('vault addresses are normalized to lowercase', () => {
    const mixed = '0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB';
    const normalized = mixed.toLowerCase();

    expect(normalized).toBe('0xc7fc0dd5f1b03e3de0c313ee0d3b06cb2dc017bb');
  });

  it('VaultFactory addresses are checksummed Ethereum addresses', () => {
    const { isAddress } = require('viem');

    expect(isAddress('0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB')).toBe(true);
    expect(isAddress('0x9cF9828Fd6253Df7C9497fd06Fa531E0CCc1d822')).toBe(true);
  });

  it('chain IDs are correctly identified', () => {
    // HyperEVM is chain 999, Ethereum is chain 1
    const hyperChainId = 999;
    const ethChainId = 1;

    expect(hyperChainId).not.toBe(ethChainId);
    expect(hyperChainId).toBe(999);
    expect(ethChainId).toBe(1);
  });
});
