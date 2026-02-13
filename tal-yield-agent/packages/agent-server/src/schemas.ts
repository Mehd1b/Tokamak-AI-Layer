import { Type, type Static } from "@sinclair/typebox";

// ============================================================
// Strategy Request
// ============================================================

export const StrategyRequestBody = Type.Object({
  riskLevel: Type.Union([
    Type.Literal("conservative"),
    Type.Literal("moderate"),
    Type.Literal("aggressive"),
  ]),
  capitalUSD: Type.Number({ minimum: 100, maximum: 100_000_000 }),
  requester: Type.String(),
  chainPreferences: Type.Optional(Type.Array(Type.Number())),
  excludeProtocols: Type.Optional(Type.Array(Type.String())),
  maxSinglePoolAllocation: Type.Optional(Type.Number({ minimum: 0.05, maximum: 1.0 })),
  taskRef: Type.Optional(Type.String()),
});
export type StrategyRequestBody = Static<typeof StrategyRequestBody>;

export const StrategyRequestResponse = Type.Object({
  taskId: Type.String(),
  status: Type.String(),
  message: Type.String(),
});
export type StrategyRequestResponse = Static<typeof StrategyRequestResponse>;

// ============================================================
// Task Status
// ============================================================

export const TaskIdParams = Type.Object({
  taskId: Type.String(),
});
export type TaskIdParams = Static<typeof TaskIdParams>;

export const TaskStatusResponse = Type.Object({
  taskId: Type.String(),
  status: Type.String(),
  snapshotId: Type.Optional(Type.String()),
  executionHash: Type.Optional(Type.String()),
  createdAt: Type.Number(),
  completedAt: Type.Optional(Type.Number()),
});
export type TaskStatusResponse = Static<typeof TaskStatusResponse>;

// ============================================================
// Pools
// ============================================================

export const PoolSearchQuery = Type.Object({
  protocol: Type.Optional(Type.String()),
  chain: Type.Optional(Type.Number()),
  minAPY: Type.Optional(Type.Number()),
  maxRisk: Type.Optional(Type.Number()),
  minTVL: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  offset: Type.Optional(Type.Number({ minimum: 0 })),
});
export type PoolSearchQuery = Static<typeof PoolSearchQuery>;

export const PoolIdParams = Type.Object({
  poolId: Type.String(),
});
export type PoolIdParams = Static<typeof PoolIdParams>;

// ============================================================
// Validation
// ============================================================

export const ValidationSubmitBody = Type.Object({
  taskId: Type.String(),
  validator: Type.String(),
  isValid: Type.Boolean(),
  executionHash: Type.String(),
});
export type ValidationSubmitBody = Static<typeof ValidationSubmitBody>;

// ============================================================
// Snapshot
// ============================================================

export const SnapshotIdParams = Type.Object({
  id: Type.String(),
});
export type SnapshotIdParams = Static<typeof SnapshotIdParams>;

// ============================================================
// Common Responses
// ============================================================

export const ErrorResponse = Type.Object({
  error: Type.String(),
  message: Type.String(),
});
export type ErrorResponse = Static<typeof ErrorResponse>;

export const HealthResponse = Type.Object({
  status: Type.String(),
  uptime: Type.Number(),
  poolCount: Type.Number(),
  snapshotCount: Type.Number(),
  taskCount: Type.Number(),
  timestamp: Type.Number(),
});
export type HealthResponse = Static<typeof HealthResponse>;
