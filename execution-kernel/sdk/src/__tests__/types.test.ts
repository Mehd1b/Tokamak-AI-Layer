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
        '0xBa1DA5f7e12F2c8614696D019A2eb48918E1f2AA',
      );
      expect(OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory).toBe(
        '0x3bB48a146bBC50F8990c86787a41185A6fC474d2',
      );
      expect(OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier).toBe(
        '0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA',
      );
    });
  });

  describe('DEFAULT_CHAIN_ID', () => {
    it('is Optimism Sepolia', () => {
      expect(DEFAULT_CHAIN_ID).toBe(11155420);
    });
  });
});
