import type { AgentRegistrationFile } from '../types';

export class RegistrationBuilder {
  private data: Partial<AgentRegistrationFile> = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    active: true,
  };

  setName(name: string): this {
    this.data.name = name;
    return this;
  }

  setDescription(description: string): this {
    this.data.description = description;
    return this;
  }

  setImage(imageUrl: string): this {
    this.data.image = imageUrl;
    return this;
  }

  setActive(active: boolean): this {
    this.data.active = active;
    return this;
  }

  addService(
    type: 'A2A' | 'MCP' | 'OASF' | 'ENS' | 'DID' | 'web' | 'email' | string,
    endpoint: string,
  ): this {
    if (!this.data.services) {
      this.data.services = {};
    }
    this.data.services[type] = endpoint;
    return this;
  }

  setSupportedTrust(
    models: Array<'reputation' | 'crypto-economic' | 'tee-attestation'>,
  ): this {
    this.data.supportedTrust = models;
    return this;
  }

  setX402Support(supported: boolean): this {
    this.data.x402Support = supported;
    return this;
  }

  addRegistration(
    agentId: string,
    agentRegistry: string,
    chainId?: number,
  ): this {
    if (!this.data.registrations) {
      this.data.registrations = [];
    }
    this.data.registrations.push({ agentId, agentRegistry, chainId });
    return this;
  }

  addCapability(capability: {
    id: string;
    name: string;
    description: string;
    inputSchema?: object;
    outputSchema?: object;
  }): this {
    if (!this.data.tal) {
      this.data.tal = {};
    }
    if (!this.data.tal.capabilities) {
      this.data.tal.capabilities = [];
    }
    this.data.tal.capabilities.push(capability);
    return this;
  }

  setOperator(operator: {
    address: string;
    organization?: string;
    website?: string;
  }): this {
    if (!this.data.tal) {
      this.data.tal = {};
    }
    this.data.tal.operator = operator;
    return this;
  }

  setTEEConfig(config: {
    provider: 'sgx' | 'nitro' | 'trustzone';
    enclaveHash: string;
    attestationEndpoint?: string;
  }): this {
    if (!this.data.tal) {
      this.data.tal = {};
    }
    this.data.tal.teeConfig = config;
    return this;
  }

  setPricing(pricing: {
    currency: 'TON' | 'USD';
    perRequest?: string;
    perToken?: string;
    subscription?: { monthly?: string; yearly?: string };
  }): this {
    if (!this.data.tal) {
      this.data.tal = {};
    }
    this.data.tal.pricing = pricing;
    return this;
  }

  build(): AgentRegistrationFile {
    const result = this.validate();
    if (!result.valid) {
      throw new Error(
        `Invalid registration file: ${result.errors.join(', ')}`,
      );
    }
    return this.data as AgentRegistrationFile;
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.data.name || this.data.name.trim() === '') {
      errors.push('name is required');
    }

    if (!this.data.description || this.data.description.trim() === '') {
      errors.push('description is required');
    }

    if (this.data.active === undefined) {
      errors.push('active status is required');
    }

    if (
      this.data.type !==
      'https://eips.ethereum.org/EIPS/eip-8004#registration-v1'
    ) {
      errors.push('invalid schema type');
    }

    if (this.data.image && !this.isValidUrl(this.data.image)) {
      errors.push('image must be a valid URL');
    }

    if (this.data.services) {
      for (const [key, value] of Object.entries(this.data.services)) {
        if (
          value &&
          key !== 'email' &&
          !this.isValidUrl(value) &&
          !value.startsWith('did:')
        ) {
          errors.push(`service endpoint for ${key} must be a valid URL`);
        }
      }
    }

    if (this.data.tal?.capabilities) {
      for (const cap of this.data.tal.capabilities) {
        if (!cap.id) errors.push('capability id is required');
        if (!cap.name) errors.push('capability name is required');
        if (!cap.description)
          errors.push('capability description is required');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  async uploadToIPFS(config: {
    pinataApiKey?: string;
    pinataSecretKey?: string;
    infuraProjectId?: string;
    infuraProjectSecret?: string;
  }): Promise<string> {
    const file = this.build();
    const content = JSON.stringify(file);

    if (config.pinataApiKey && config.pinataSecretKey) {
      return this.uploadToPinata(
        content,
        config.pinataApiKey,
        config.pinataSecretKey,
      );
    }

    if (config.infuraProjectId && config.infuraProjectSecret) {
      return this.uploadToInfura(
        content,
        config.infuraProjectId,
        config.infuraProjectSecret,
      );
    }

    throw new Error(
      'Either Pinata or Infura credentials must be provided for IPFS upload',
    );
  }

  private async uploadToPinata(
    content: string,
    apiKey: string,
    secretKey: string,
  ): Promise<string> {
    const response = await fetch(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          pinata_api_key: apiKey,
          pinata_secret_api_key: secretKey,
        },
        body: JSON.stringify({
          pinataContent: JSON.parse(content),
          pinataMetadata: { name: 'TAL Agent Registration' },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Pinata upload failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { IpfsHash: string };
    return `ipfs://${data.IpfsHash}`;
  }

  private async uploadToInfura(
    content: string,
    projectId: string,
    projectSecret: string,
  ): Promise<string> {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([content], { type: 'application/json' }),
    );

    const auth = btoa(`${projectId}:${projectSecret}`);
    const response = await fetch(
      'https://ipfs.infura.io:5001/api/v0/add',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      throw new Error(`Infura upload failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { Hash: string };
    return `ipfs://${data.Hash}`;
  }

  private isValidUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }
}
