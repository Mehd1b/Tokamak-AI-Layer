import { describe, it, expect } from 'vitest';
import {
  ValidationModel,
  ValidationStatus,
  OPTIMISM_SEPOLIA_ADDRESSES,
  DEFAULT_CHAIN_ID,
} from '../types';

describe('Types and Constants', () => {
  describe('ValidationModel enum', () => {
    it('has correct values', () => {
      expect(ValidationModel.ReputationOnly).toBe(0);
      expect(ValidationModel.StakeSecured).toBe(1);
      expect(ValidationModel.TEEAttested).toBe(2);
      expect(ValidationModel.Hybrid).toBe(3);
    });
  });

  describe('ValidationStatus enum', () => {
    it('has correct values', () => {
      expect(ValidationStatus.Pending).toBe(0);
      expect(ValidationStatus.Completed).toBe(1);
      expect(ValidationStatus.Expired).toBe(2);
      expect(ValidationStatus.Disputed).toBe(3);
    });
  });

  describe('OPTIMISM_SEPOLIA_ADDRESSES', () => {
    it('has all required contract addresses', () => {
      expect(OPTIMISM_SEPOLIA_ADDRESSES.identityRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(OPTIMISM_SEPOLIA_ADDRESSES.reputationRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(OPTIMISM_SEPOLIA_ADDRESSES.validationRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(OPTIMISM_SEPOLIA_ADDRESSES.stakingIntegrationModule).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('matches deployed addresses', () => {
      expect(OPTIMISM_SEPOLIA_ADDRESSES.identityRegistry).toBe(
        '0x3f89CD27fD877827E7665A9883b3c0180E22A525',
      );
      expect(OPTIMISM_SEPOLIA_ADDRESSES.reputationRegistry).toBe(
        '0x0052258E517835081c94c0B685409f2EfC4D502b',
      );
      expect(OPTIMISM_SEPOLIA_ADDRESSES.validationRegistry).toBe(
        '0x09447147C6E75a60A449f38532F06E19F5F632F3',
      );
      expect(OPTIMISM_SEPOLIA_ADDRESSES.stakingIntegrationModule).toBe(
        '0x41FF86643f6d550725177af1ABBF4db9715A74b8',
      );
    });
  });

  describe('DEFAULT_CHAIN_ID', () => {
    it('is Optimism Sepolia', () => {
      expect(DEFAULT_CHAIN_ID).toBe(11155420);
    });
  });
});
