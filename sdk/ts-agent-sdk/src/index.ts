// Types
export type {
  ActionV1,
  AgentContext,
  AgentOutput,
  KernelInputV1,
  KernelJournalV1,
  OraclePriceFeed,
  PricePoint,
  Signature,
} from "./types.js";

export {
  ActionType,
  ExecutionStatus,
  PROTOCOL_VERSION,
  KERNEL_VERSION,
  MAX_ACTIONS_PER_OUTPUT,
  MAX_ACTION_PAYLOAD_BYTES,
  MAX_SINGLE_ACTION_BYTES,
  MAX_AGENT_INPUT_BYTES,
  MAX_AGENT_OUTPUT_BYTES,
  JOURNAL_SIZE,
  MAX_PRICE_COUNT,
  FEED_VERSION,
  PRICE_POINT_SIZE,
  FEED_HEADER_SIZE,
  SIGNATURE_SIZE,
} from "./types.js";

// Actions
export { Actions } from "./actions.js";
export type { Hex } from "./actions.js";

// Codec
export {
  encodeAgentOutput,
  decodeAgentOutput,
  decodeKernelInput,
  encodeKernelInput,
  encodeKernelJournal,
  decodeKernelJournal,
  writeU32LE,
  writeU64LE,
  readU32LE,
  readU64LE,
} from "./codec.js";

// Oracle
export { parseOracleFeed, getPrice, feedWireLen } from "./oracle.js";

// Agent
export { defineAgent } from "./agent.js";
export type { AgentFn, AgentDefinition } from "./agent.js";
