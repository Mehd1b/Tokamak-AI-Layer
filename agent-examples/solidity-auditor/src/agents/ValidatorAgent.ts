import { BaseAgent } from './BaseAgent.js';
import type { TaskInput, ValidationResult } from '../types.js';
import { complete } from '../services/llm.js';
import { hashContent } from '../services/storage.js';

const COMPARISON_PROMPT = `You are a validation comparison engine. You will receive two outputs for the same task and must assess their semantic similarity.

Compare the ORIGINAL OUTPUT with the RE-EXECUTION OUTPUT and provide:
1. A similarity score from 0-100 (100 = identical meaning, 0 = completely different)
2. A brief explanation of differences if any

Respond ONLY in this JSON format:
{"score": <number>, "explanation": "<string>"}`;

export class ValidatorAgent extends BaseAgent {
  readonly id = 'validator';
  readonly name = 'TAL Validator';
  readonly description = 'Re-executes tasks and validates outputs for StakeSecured verification';
  readonly version = '1.0.0';
  readonly capabilities = [
    {
      id: 'task-validation',
      name: 'Task Output Validation',
      description: 'Re-executes a task and compares output to original for validation scoring',
    },
  ];

  async process(input: TaskInput): Promise<string> {
    const { originalOutput, originalOutputHash, agentId, taskHash } = (input.options || {}) as {
      originalOutput?: string;
      originalOutputHash?: string;
      agentId?: string;
      taskHash?: string;
    };

    if (!input.text) {
      throw new Error('Original task input text is required');
    }
    if (!originalOutput) {
      throw new Error('options.originalOutput is required for validation');
    }

    // Step 1: Determine which prompt to use based on original agent
    const reExecutionPrompt = this.getPromptForAgent(agentId || 'summarizer');

    // Step 2: Re-execute the task
    const reExecutionOutput = await complete(reExecutionPrompt, input.text);
    const reExecutionHash = hashContent(reExecutionOutput);

    // Step 3: Check for exact match
    if (originalOutputHash && reExecutionHash === originalOutputHash) {
      const result: ValidationResult = {
        score: 100,
        matchType: 'exact',
        reExecutionHash,
        details: 'Exact hash match - outputs are identical',
      };
      return JSON.stringify(result);
    }

    // Step 4: Semantic comparison via LLM
    const comparisonInput = `ORIGINAL OUTPUT:\n${originalOutput}\n\n---\n\nRE-EXECUTION OUTPUT:\n${reExecutionOutput}`;
    const comparisonRaw = await complete(COMPARISON_PROMPT, comparisonInput);

    let score = 0;
    let explanation = 'Unable to parse comparison';
    try {
      const parsed = JSON.parse(comparisonRaw);
      score = Math.min(100, Math.max(0, Number(parsed.score) || 0));
      explanation = parsed.explanation || 'No explanation provided';
    } catch {
      // If LLM didn't return valid JSON, try to extract a number
      const match = comparisonRaw.match(/(\d+)/);
      score = match ? Math.min(100, Math.max(0, parseInt(match[1], 10))) : 50;
      explanation = comparisonRaw.substring(0, 200);
    }

    const matchType: ValidationResult['matchType'] =
      score >= 90 ? 'semantic' : score >= 50 ? 'partial' : 'mismatch';

    const result: ValidationResult = {
      score,
      matchType,
      reExecutionHash,
      details: explanation,
    };

    return JSON.stringify(result);
  }

  private getPromptForAgent(agentId: string): string {
    switch (agentId) {
      case 'auditor':
        return 'You are an expert Solidity smart contract auditor. Analyze the provided smart contract code for security vulnerabilities, gas optimization issues, and best practice violations. Provide a structured security audit report with severity levels (Critical, High, Medium, Low, Informational) for each finding.';
      case 'summarizer':
      default:
        return 'You are an expert text summarizer. Produce a concise, accurate summary that preserves key facts, figures, and conclusions. Format: ## TLDR (one line), ## Summary (1-2 paragraphs), ## Key Points (bullet list).';
    }
  }
}
