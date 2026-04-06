/**
 * Agent definition and validation.
 *
 * Provides the `defineAgent` function for creating validated agent definitions.
 */

import type { AgentContext, AgentOutput } from "./types.js";
import { MAX_ACTIONS_PER_OUTPUT, MAX_ACTION_PAYLOAD_BYTES } from "./types.js";

/**
 * The function signature for an agent's main logic.
 *
 * @param ctx - Execution context with identity and metadata
 * @param inputs - Opaque agent-specific input data (max 64 KB)
 * @returns AgentOutput containing ordered actions
 */
export type AgentFn = (ctx: AgentContext, inputs: Uint8Array) => AgentOutput;

/**
 * A validated agent definition wrapping the agent function.
 */
export interface AgentDefinition {
  /** Execute the agent logic with validation of the output. */
  readonly run: AgentFn;
}

/**
 * Define a new agent with automatic output validation.
 *
 * The returned AgentDefinition wraps the provided function and validates:
 * - Action count does not exceed MAX_ACTIONS_PER_OUTPUT (64)
 * - Each action payload does not exceed MAX_ACTION_PAYLOAD_BYTES (16,384)
 *
 * @param fn - The agent's main logic function
 * @returns An AgentDefinition that validates output on every call
 *
 * @example
 * ```ts
 * import { defineAgent, Actions } from '@tokagent/agent-sdk';
 *
 * const agent = defineAgent((ctx, inputs) => {
 *   return {
 *     actions: [Actions.noOp()],
 *   };
 * });
 * ```
 */
export function defineAgent(fn: AgentFn): AgentDefinition {
  const run: AgentFn = (ctx, inputs) => {
    const output = fn(ctx, inputs);

    // Validate action count
    if (output.actions.length > MAX_ACTIONS_PER_OUTPUT) {
      throw new Error(
        `Agent produced too many actions: ${output.actions.length} (limit: ${MAX_ACTIONS_PER_OUTPUT})`
      );
    }

    // Validate each action's payload size
    for (let i = 0; i < output.actions.length; i++) {
      const action = output.actions[i]!;
      if (action.payload.length > MAX_ACTION_PAYLOAD_BYTES) {
        throw new Error(
          `Action #${i} payload too large: ${action.payload.length} bytes (limit: ${MAX_ACTION_PAYLOAD_BYTES})`
        );
      }
    }

    return output;
  };

  return { run };
}
