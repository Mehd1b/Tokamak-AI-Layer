import type { AgentCapability, AgentInfo, TaskInput, TaskResult } from '../types.js';
import { v4 as uuid } from 'uuid';
import { hashContent, saveTask } from '../services/storage.js';
import { config } from '../config.js';

export abstract class BaseAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;
  abstract readonly capabilities: AgentCapability[];

  onChainId?: bigint;

  abstract process(input: TaskInput): Promise<string>;

  async execute(input: TaskInput): Promise<TaskResult> {
    const taskId = uuid();
    const inputHash = hashContent(JSON.stringify(input));
    const now = new Date().toISOString();

    const task: TaskResult = {
      taskId,
      agentId: this.id,
      status: 'processing',
      input,
      output: null,
      outputHash: null,
      inputHash,
      createdAt: now,
      completedAt: null,
      error: null,
      metadata: {},
    };

    await saveTask(task);

    try {
      const output = await this.process(input);
      const outputHash = hashContent(output);

      task.status = 'completed';
      task.output = output;
      task.outputHash = outputHash;
      task.completedAt = new Date().toISOString();
    } catch (err) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : 'Unknown error';
      task.completedAt = new Date().toISOString();
    }

    await saveTask(task);
    return task;
  }

  private getBaseUrl(): string {
    if (config.PUBLIC_URL) return config.PUBLIC_URL.replace(/\/$/, '');
    const host = config.HOST === '0.0.0.0' ? 'localhost' : config.HOST;
    return `http://${host}:${config.PORT}`;
  }

  getInfo(): AgentInfo {
    const baseUrl = this.getBaseUrl();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      capabilities: this.capabilities,
      status: 'active',
      endpoint: `${baseUrl}/api/tasks`,
      onChainId: this.onChainId,
    };
  }

  getRegistrationFile() {
    const baseUrl = this.getBaseUrl();
    return {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1' as const,
      name: this.name,
      description: this.description,
      active: true,
      services: {
        A2A: `${baseUrl}/api/agents/${this.id}`,
        web: `${baseUrl}`,
      },
      supportedTrust: ['reputation', 'crypto-economic'] as Array<
        'reputation' | 'crypto-economic' | 'tee-attestation'
      >,
      tal: {
        capabilities: this.capabilities,
        operator: {
          address: '0x0000000000000000000000000000000000000000',
          organization: 'Tokamak AI Layer',
          website: baseUrl,
        },
        pricing: {
          currency: 'TON' as const,
          perRequest: '0.01',
        },
      },
    };
  }
}
