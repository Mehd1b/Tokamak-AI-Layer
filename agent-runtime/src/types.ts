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
  paymentTxHash?: string;
  taskRef?: string;
  chainId?: number;
}

export interface ValidationRequest {
  requestHash: string;
  agentId: bigint;
  requester: string;
  taskHash: string;
  outputHash: string;
  model: number; // 0=ReputationOnly, 1=StakeSecured, 2=TEEAttested, 3=Hybrid
  bounty: bigint;
  deadline: bigint;
  status: number; // 0=Pending, 1=Completed, 2=Expired, 3=Disputed
  validator: string;
  score: number;
  proof: string;
  detailsURI: string;
}

export interface ValidationResult {
  score: number;
  matchType: 'exact' | 'semantic' | 'partial' | 'mismatch';
  reExecutionHash: string;
  details: string;
}
