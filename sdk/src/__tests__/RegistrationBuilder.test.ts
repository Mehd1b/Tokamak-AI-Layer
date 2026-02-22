import { describe, it, expect } from 'vitest';
import { RegistrationBuilder } from '../identity/RegistrationBuilder';

describe('RegistrationBuilder', () => {
  describe('build()', () => {
    it('builds a valid minimal registration file', () => {
      const file = new RegistrationBuilder()
        .setName('Test Agent')
        .setDescription('A test agent for unit testing')
        .build();

      expect(file.type).toBe(
        'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      );
      expect(file.name).toBe('Test Agent');
      expect(file.description).toBe('A test agent for unit testing');
      expect(file.active).toBe(true);
    });

    it('builds a full registration file with all fields', () => {
      const file = new RegistrationBuilder()
        .setName('Full Agent')
        .setDescription('Fully configured agent')
        .setImage('https://example.com/avatar.png')
        .setActive(true)
        .addService('A2A', 'https://agent.example.com/a2a')
        .addService('MCP', 'https://agent.example.com/mcp')
        .setSupportedTrust(['reputation', 'tee-attestation'])
        .setX402Support(true)
        .addRegistration('1', '0x1234567890abcdef', 11155420)
        .addCapability({
          id: 'text-gen',
          name: 'Text Generation',
          description: 'Generates text from prompts',
        })
        .setOperator({
          address: '0xabcdef1234567890',
          organization: 'TestOrg',
        })
        .setTEEConfig({
          provider: 'sgx',
          enclaveHash: '0xdeadbeef',
        })
        .setPricing({
          currency: 'TON',
          perRequest: '0.01',
        })
        .build();

      expect(file.name).toBe('Full Agent');
      expect(file.services?.A2A).toBe('https://agent.example.com/a2a');
      expect(file.services?.MCP).toBe('https://agent.example.com/mcp');
      expect(file.supportedTrust).toEqual(['reputation', 'tee-attestation']);
      expect(file.x402Support).toBe(true);
      expect(file.registrations).toHaveLength(1);
      expect(file.registrations![0].chainId).toBe(11155420);
      expect(file.tal?.capabilities).toHaveLength(1);
      expect(file.tal?.capabilities![0].id).toBe('text-gen');
      expect(file.tal?.operator?.organization).toBe('TestOrg');
      expect(file.tal?.teeConfig?.provider).toBe('sgx');
      expect(file.tal?.pricing?.currency).toBe('TON');
    });

    it('throws when name is missing', () => {
      expect(() =>
        new RegistrationBuilder()
          .setDescription('No name agent')
          .build(),
      ).toThrow('name is required');
    });

    it('throws when description is missing', () => {
      expect(() =>
        new RegistrationBuilder().setName('No desc').build(),
      ).toThrow('description is required');
    });

    it('throws when image URL is invalid', () => {
      expect(() =>
        new RegistrationBuilder()
          .setName('Bad Image')
          .setDescription('Has bad image URL')
          .setImage('not-a-url')
          .build(),
      ).toThrow('image must be a valid URL');
    });

    it('throws when service endpoint is invalid', () => {
      expect(() =>
        new RegistrationBuilder()
          .setName('Bad Service')
          .setDescription('Has bad service URL')
          .addService('A2A', 'not-a-url')
          .build(),
      ).toThrow('service endpoint for A2A must be a valid URL');
    });

    it('allows DID-style service endpoints', () => {
      const file = new RegistrationBuilder()
        .setName('DID Agent')
        .setDescription('Agent with DID service')
        .addService('DID', 'did:example:123456')
        .build();

      expect(file.services?.DID).toBe('did:example:123456');
    });

    it('throws when capability is missing required fields', () => {
      expect(() =>
        new RegistrationBuilder()
          .setName('Bad Cap')
          .setDescription('Missing cap fields')
          .addCapability({ id: '', name: '', description: '' })
          .build(),
      ).toThrow('capability id is required');
    });
  });

  describe('validate()', () => {
    it('returns valid=true for a correct registration', () => {
      const result = new RegistrationBuilder()
        .setName('Valid Agent')
        .setDescription('Valid description')
        .validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns multiple errors for missing fields', () => {
      const result = new RegistrationBuilder().validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required');
      expect(result.errors).toContain('description is required');
    });
  });

  describe('toJSON()', () => {
    it('serializes the registration to JSON', () => {
      const builder = new RegistrationBuilder()
        .setName('JSON Agent')
        .setDescription('Serializable agent');

      const json = builder.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe('JSON Agent');
      expect(parsed.description).toBe('Serializable agent');
      expect(parsed.type).toBe(
        'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      );
    });
  });

  describe('fluent API', () => {
    it('supports method chaining', () => {
      const builder = new RegistrationBuilder();
      const returned = builder
        .setName('Chain Test')
        .setDescription('Testing chaining')
        .setImage('https://example.com/img.png')
        .setActive(true)
        .addService('web', 'https://example.com')
        .setSupportedTrust(['reputation'])
        .setX402Support(false)
        .addRegistration('1', '0x123', 1)
        .addCapability({ id: 'a', name: 'A', description: 'Cap A' })
        .setOperator({ address: '0xabc' })
        .setTEEConfig({ provider: 'nitro', enclaveHash: '0xdef' })
        .setPricing({ currency: 'USD', perRequest: '0.05' });

      expect(returned).toBe(builder);
    });
  });

  describe('uploadToIPFS()', () => {
    it('throws without IPFS credentials', async () => {
      const builder = new RegistrationBuilder()
        .setName('Upload Test')
        .setDescription('Upload test agent');

      await expect(builder.uploadToIPFS({})).rejects.toThrow(
        'Either Pinata or Infura credentials must be provided',
      );
    });
  });
});
