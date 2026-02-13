import type { Address, Hash } from "viem";
import { TaskStatus, ValidationModel, ValidationStatus } from "../types.js";

// ============================================================
// Mock addresses
// ============================================================

export const MOCK_ADDRESSES = {
  identityRegistry: "0x3f89CD27fD877827E7665A9883b3c0180E22A525" as Address,
  taskFeeEscrow: "0x6D68Cd8fD89BF1746A1948783C92A00E591d1227" as Address,
  reputationRegistry: "0x0052258E517835081c94c0B685409f2EfC4D502b" as Address,
  validationRegistry: "0x09447147C6E75a60A449f38532F06E19F5F632F3" as Address,
  stakingIntegrationModule: "0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30" as Address,
};

export const MOCK_OWNER = "0x1234567890abcdef1234567890abcdef12345678" as Address;
export const MOCK_OPERATOR = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
export const MOCK_PAYER = "0x9876543210fedcba9876543210fedcba98765432" as Address;
export const MOCK_VALIDATOR = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
export const MOCK_TX_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hash;
export const MOCK_TASK_REF = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hash;
export const MOCK_FEEDBACK_HASH = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Hash;
export const MOCK_REQUEST_HASH = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as Hash;
export const MOCK_TASK_HASH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Hash;
export const MOCK_OUTPUT_HASH = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as Hash;

// ============================================================
// Mock contract return values
// ============================================================

export const MOCK_AGENT_URI = "ipfs://QmYield123";

export const MOCK_TASK_ESCROW_DATA = {
  payer: MOCK_PAYER,
  agentId: 1n,
  amount: 500000000000000000n, // 0.5 TON
  paidAt: 1700000000n,
  status: TaskStatus.Escrowed as number,
};

export const MOCK_FEEDBACK_ENTRY = {
  value: 85n,
  valueDecimals: 0,
  tag1: "yield-accuracy",
  tag2: "apy-prediction",
  endpoint: "/strategy",
  feedbackURI: "ipfs://QmFeedback123",
  feedbackHash: MOCK_FEEDBACK_HASH,
  isRevoked: false,
  timestamp: 1700000000n,
};

export const MOCK_FEEDBACK_SUMMARY = {
  totalValue: 255n,
  count: 3n,
  min: 75n,
  max: 95n,
};

export const MOCK_STAKE_WEIGHTED_SUMMARY = {
  weightedTotalValue: 850n,
  totalWeight: 10000n,
  count: 3n,
  min: 75n,
  max: 95n,
};

// Validation mocks
export const MOCK_VALIDATION_REQUEST = {
  agentId: 1n,
  requester: MOCK_PAYER,
  taskHash: MOCK_TASK_HASH,
  outputHash: MOCK_OUTPUT_HASH,
  model: ValidationModel.StakeSecured as number,
  bounty: 10000000000000000000n, // 10 TON
  deadline: 1700100000n,
  status: ValidationStatus.Completed as number,
};

export const MOCK_VALIDATION_RESPONSE = {
  validator: MOCK_VALIDATOR,
  score: 95,
  proof: "0x" as Hash,
  detailsURI: "ipfs://QmValidation123",
  timestamp: 1700050000n,
};

// Staking mocks
export const MOCK_OPERATOR_STATUS = [
  5000000000000000000000n, // 5000 TON staked
  true,                     // isVerified
  0n,                       // slashingCount
  0n,                       // lastSlashTime
] as const;

// ============================================================
// Mock viem clients
// ============================================================

type ReadContractFn = (args: {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}) => Promise<unknown>;

type SimulateContractFn = (args: {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  account: unknown;
}) => Promise<{ request: unknown }>;

export function createMockReadContract(overrides?: Record<string, unknown>): ReadContractFn {
  const defaults: Record<string, unknown> = {
    agentExists: true,
    agentURI: MOCK_AGENT_URI,
    getAgentCount: 5n,
    getAgentsByOwner: [1n, 2n],
    getOperator: MOCK_OPERATOR,
    ownerOf: MOCK_OWNER,
    isVerifiedOperator: true,
    getMetadata: "0x",

    // Escrow
    REFUND_DEADLINE: 172800n, // 48 hours
    agentFees: 500000000000000000n,
    agentBalances: 1500000000000000000n,
    getAgentFee: 500000000000000000n,
    getAgentBalance: 1500000000000000000n,
    isTaskPaid: true,
    getTaskEscrow: MOCK_TASK_ESCROW_DATA,
    hasUsedAgent: false,

    // Reputation
    getFeedback: [MOCK_FEEDBACK_ENTRY],
    getFeedbackCount: 3n,
    getClientList: [MOCK_PAYER],
    getSummary: MOCK_FEEDBACK_SUMMARY,
    getStakeWeightedSummary: MOCK_STAKE_WEIGHTED_SUMMARY,
    hasPaymentProof: true,

    // Validation
    getValidation: [MOCK_VALIDATION_REQUEST, MOCK_VALIDATION_RESPONSE],
    getAgentValidations: [MOCK_REQUEST_HASH],
    getValidationsByRequester: [MOCK_REQUEST_HASH],
    getValidationsByValidator: [MOCK_REQUEST_HASH],
    getPendingValidationCount: 2n,
    getSelectedValidator: MOCK_VALIDATOR,
    isDisputed: false,

    // Staking
    getStake: 5000000000000000000000n, // 5000 TON
    getOperatorStatus: MOCK_OPERATOR_STATUS,
    MIN_OPERATOR_STAKE: 1000000000000000000000n, // 1000 TON

    ...overrides,
  };

  return async ({ functionName }) => {
    if (functionName in defaults) {
      return defaults[functionName];
    }
    throw new Error(`Unmocked function: ${functionName}`);
  };
}

export function createMockSimulateContract(): SimulateContractFn {
  return async () => ({ request: {} });
}

export function createMockPublicClient(overrides?: Record<string, unknown>) {
  return {
    readContract: createMockReadContract(overrides),
    simulateContract: createMockSimulateContract(),
  } as unknown;
}

export function createMockWalletClient() {
  return {
    account: { address: MOCK_OWNER },
    writeContract: async () => MOCK_TX_HASH,
  } as unknown;
}
