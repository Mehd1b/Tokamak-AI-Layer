import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionTracer, verifyTraces } from "./execution-trace.js";

describe("ExecutionTracer", () => {
  let tracer: ExecutionTracer;

  beforeEach(() => {
    tracer = new ExecutionTracer();
  });

  // ================================================================
  // Step Recording
  // ================================================================
  describe("step recording", () => {
    it("records steps with incrementing IDs", () => {
      tracer.recordStep("filter", { count: 10 }, { count: 5 }, 10);
      tracer.recordStep("score", { pools: 5 }, { scores: [1, 2, 3] }, 20);

      expect(tracer.getStepCount()).toBe(2);
    });

    it("starts with zero steps", () => {
      expect(tracer.getStepCount()).toBe(0);
    });
  });

  // ================================================================
  // Finalization
  // ================================================================
  describe("finalize", () => {
    it("produces a valid execution trace", () => {
      tracer.recordStep("step1", { a: 1 }, { b: 2 }, 5);
      tracer.recordStep("step2", { b: 2 }, { c: 3 }, 10);

      const trace = tracer.finalize({ input: "data" }, { output: "result" });

      expect(trace.inputHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(trace.outputHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(trace.executionHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(trace.steps).toHaveLength(2);
      expect(trace.steps[0]!.stepId).toBe(0);
      expect(trace.steps[1]!.stepId).toBe(1);
    });

    it("different inputs produce different hashes", () => {
      tracer.recordStep("op", { x: 1 }, { y: 2 }, 1);
      const trace1 = tracer.finalize({ input: "A" }, { output: "B" });

      tracer.reset();
      tracer.recordStep("op", { x: 1 }, { y: 2 }, 1);
      const trace2 = tracer.finalize({ input: "C" }, { output: "D" });

      expect(trace1.executionHash).not.toBe(trace2.executionHash);
    });

    it("different steps produce different hashes", () => {
      tracer.recordStep("op1", { x: 1 }, { y: 2 }, 1);
      const trace1 = tracer.finalize({ in: 1 }, { out: 1 });

      tracer.reset();
      tracer.recordStep("op2", { x: 1 }, { y: 2 }, 1);
      const trace2 = tracer.finalize({ in: 1 }, { out: 1 });

      expect(trace1.executionHash).not.toBe(trace2.executionHash);
    });
  });

  // ================================================================
  // Determinism
  // ================================================================
  describe("determinism", () => {
    it("same operations produce identical execution hash", () => {
      tracer.recordStep("filter", { count: 10 }, { count: 5 }, 10);
      tracer.recordStep("score", { pools: 5 }, { scores: [80, 60] }, 20);
      const trace1 = tracer.finalize({ snapshot: "snap1" }, { strategy: "strat1" });

      tracer.reset();
      tracer.recordStep("filter", { count: 10 }, { count: 5 }, 10);
      tracer.recordStep("score", { pools: 5 }, { scores: [80, 60] }, 20);
      const trace2 = tracer.finalize({ snapshot: "snap1" }, { strategy: "strat1" });

      expect(trace1.executionHash).toBe(trace2.executionHash);
    });

    it("object key order doesn't affect hash", () => {
      tracer.recordStep("op", { a: 1, b: 2 }, {}, 1);
      const trace1 = tracer.finalize({}, {});

      tracer.reset();
      tracer.recordStep("op", { b: 2, a: 1 }, {}, 1);
      const trace2 = tracer.finalize({}, {});

      expect(trace1.executionHash).toBe(trace2.executionHash);
    });
  });

  // ================================================================
  // Reset
  // ================================================================
  describe("reset", () => {
    it("clears all steps", () => {
      tracer.recordStep("op", {}, {}, 1);
      tracer.recordStep("op", {}, {}, 1);
      expect(tracer.getStepCount()).toBe(2);

      tracer.reset();
      expect(tracer.getStepCount()).toBe(0);
    });
  });

  // ================================================================
  // Trace Verification
  // ================================================================
  describe("verifyTraces", () => {
    it("matching traces verify as equal", () => {
      tracer.recordStep("op", { x: 1 }, { y: 2 }, 1);
      const trace1 = tracer.finalize({ in: 1 }, { out: 2 });

      tracer.reset();
      tracer.recordStep("op", { x: 1 }, { y: 2 }, 1);
      const trace2 = tracer.finalize({ in: 1 }, { out: 2 });

      expect(verifyTraces(trace1, trace2)).toBe(true);
    });

    it("different traces do not verify", () => {
      tracer.recordStep("op", { x: 1 }, { y: 2 }, 1);
      const trace1 = tracer.finalize({ in: 1 }, { out: 2 });

      tracer.reset();
      tracer.recordStep("op", { x: 99 }, { y: 2 }, 1);
      const trace2 = tracer.finalize({ in: 1 }, { out: 2 });

      expect(verifyTraces(trace1, trace2)).toBe(false);
    });
  });
});
