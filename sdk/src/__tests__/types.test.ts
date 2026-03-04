import { describe, it, expect } from 'vitest';
import {
  KernelActionType,
  ExecutionStatus,
  OPTIMISM_SEPOLIA_ADDRESSES,
  DEFAULT_CHAIN_ID,
} from '../types';

describe('Types and Constants', () => {
  describe('KernelActionType enum', () => {
    it('has correct values', () => {
      expect(KernelActionType.CALL).toBe(0x02);
      expect(KernelActionType.TRANSFER_ERC20).toBe(0x03);
      expect(KernelActionType.NO_OP).toBe(0x04);
    });

    it('has exactly 3 action types', () => {
      const numericValues = Object.values(KernelActionType).filter(
        (v) => typeof v === 'number',
      );
      expect(numericValues).toHaveLength(3);
    });
  });

  describe('ExecutionStatus enum', () => {
    it('has correct values', () => {
      expect(ExecutionStatus.Success).toBe(0x01);
      expect(ExecutionStatus.Failure).toBe(0x02);
    });

    it('has exactly 2 statuses', () => {
      const numericValues = Object.values(ExecutionStatus).filter(
        (v) => typeof v === 'number',
      );
      expect(numericValues).toHaveLength(2);
    });
  });

  describe('OPTIMISM_SEPOLIA_ADDRESSES', () => {
    it('has all required contract addresses', () => {
      expect(OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('matches deployed addresses', () => {
      expect(OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry).toBe(
        '0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168',
      );
      expect(OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory).toBe(
        '0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C',
      );
      expect(OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier).toBe(
        '0x1eB41537037fB771CBA8Cd088C7c806936325eB5',
      );
    });
  });

  describe('DEFAULT_CHAIN_ID', () => {
    it('is Ethereum Mainnet', () => {
      expect(DEFAULT_CHAIN_ID).toBe(1);
    });
  });
});
