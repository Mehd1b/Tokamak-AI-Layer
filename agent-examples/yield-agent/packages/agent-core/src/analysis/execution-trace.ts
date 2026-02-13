import { keccak256, toHex } from "viem";
import type { TraceStep, ExecutionTrace } from "./types.js";

/**
 * Deterministic execution trace for StakeSecured validation.
 *
 * Every computation step is logged and hashed. Validators re-execute
 * the same pipeline and compare executionHash to verify correctness.
 */
export class ExecutionTracer {
  private steps: TraceStep[] = [];
  private stepCounter = 0;

  /**
   * Record a computation step.
   */
  recordStep(operation: string, input: unknown, output: unknown, duration: number): void {
    const inputHash = this.hashValue(input);
    const outputHash = this.hashValue(output);

    this.steps.push({
      stepId: this.stepCounter++,
      operation,
      inputHash,
      outputHash,
      duration,
    });
  }

  /**
   * Finalize the trace and compute the execution hash.
   *
   * executionHash = keccak256(inputHash + outputHash + all step hashes)
   */
  finalize(pipelineInput: unknown, pipelineOutput: unknown): ExecutionTrace {
    const inputHash = this.hashValue(pipelineInput);
    const outputHash = this.hashValue(pipelineOutput);

    // Combine all step hashes into a single deterministic hash
    const stepHashes = this.steps.map(
      (s) => `${s.stepId}:${s.operation}:${s.inputHash}:${s.outputHash}`,
    );

    const combinedData = [inputHash, outputHash, ...stepHashes].join("|");
    const executionHash = keccak256(toHex(combinedData));

    return {
      steps: [...this.steps],
      inputHash,
      outputHash,
      executionHash,
    };
  }

  /**
   * Reset the tracer for a new execution.
   */
  reset(): void {
    this.steps = [];
    this.stepCounter = 0;
  }

  /**
   * Get the current step count.
   */
  getStepCount(): number {
    return this.steps.length;
  }

  /**
   * Deterministic hash of any value via JSON serialization.
   */
  private hashValue(value: unknown): string {
    const serialized = JSON.stringify(value, (_key, val) => {
      // Sort object keys for determinism
      if (val && typeof val === "object" && !Array.isArray(val)) {
        return Object.keys(val)
          .sort()
          .reduce<Record<string, unknown>>((sorted, k) => {
            sorted[k] = (val as Record<string, unknown>)[k];
            return sorted;
          }, {});
      }
      // Convert bigint to string for serialization
      if (typeof val === "bigint") {
        return val.toString();
      }
      return val;
    });
    return keccak256(toHex(serialized));
  }
}

/**
 * Verify that two execution traces match (same executionHash).
 */
export function verifyTraces(trace1: ExecutionTrace, trace2: ExecutionTrace): boolean {
  return trace1.executionHash === trace2.executionHash;
}
