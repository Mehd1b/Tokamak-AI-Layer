export { TALClient, type TALClientOptions } from "./tal-client.js";
export { IdentityClient } from "./clients/identity-client.js";
export { EscrowClient } from "./clients/escrow-client.js";
export { ReputationClient } from "./clients/reputation-client.js";
export { ValidationClient } from "./clients/validation-client.js";
export { StakingClient } from "./clients/staking-client.js";
export {
  type TALClientConfig,
  type AgentMetadata,
  type AgentInfo,
  TaskStatus,
  type TaskEscrowData,
  type Feedback,
  type FeedbackSummary,
  type StakeWeightedSummary,
  type SubmitFeedbackParams,
  ValidationModel,
  ValidationStatus,
  type ValidationRequest,
  type ValidationResponse,
  type ValidationResult,
  type OperatorStatus,
} from "./types.js";
