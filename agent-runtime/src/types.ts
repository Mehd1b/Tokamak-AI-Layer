export interface TaskInput {
  text: string;
  options?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  input: TaskInput;
  output: string | null;
  outputHash: string | null;
  inputHash: string | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  inputSchema?: object;
  outputSchema?: object;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities: AgentCapability[];
  status: 'active' | 'inactive';
  endpoint: string;
  onChainId?: bigint;
}

export interface TaskSubmission {
  agentId: string;
  input: TaskInput;
}
