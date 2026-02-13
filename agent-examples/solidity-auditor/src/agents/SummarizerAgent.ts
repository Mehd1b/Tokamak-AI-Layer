import { BaseAgent } from './BaseAgent.js';
import type { AgentCapability, TaskInput } from '../types.js';
import { complete } from '../services/llm.js';

const SYSTEM_PROMPT = `You are a professional text summarization agent registered on the Tokamak AI Layer (ERC-8004).

Your task is to produce clear, accurate, and concise summaries of the provided text.

Rules:
- Preserve key facts, figures, and conclusions
- Maintain the original tone and intent
- Output a structured summary with: key points (bullet list), main summary (1-2 paragraphs), and a one-line TLDR
- If the input is too short to summarize, state that clearly

Output format:
## TLDR
<one line>

## Summary
<1-2 paragraphs>

## Key Points
- <point 1>
- <point 2>
- ...`;

export class SummarizerAgent extends BaseAgent {
  readonly id = 'summarizer';
  readonly name = 'TAL Text Summarizer';
  readonly description =
    'AI-powered text summarization agent. Produces structured summaries with key points extraction, registered and validated on Tokamak AI Layer.';
  readonly version = '1.0.0';

  readonly capabilities: AgentCapability[] = [
    {
      id: 'text-summarize',
      name: 'Text Summarization',
      description: 'Summarize any text input into a structured summary with TLDR, main summary, and key points.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text to summarize' },
        },
        required: ['text'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Structured markdown summary' },
        },
      },
    },
  ];

  async process(input: TaskInput): Promise<string> {
    if (!input.text || input.text.trim().length === 0) {
      throw new Error('Input text is required');
    }

    if (input.text.trim().length < 50) {
      throw new Error('Input text is too short to summarize (minimum 50 characters)');
    }

    return complete(SYSTEM_PROMPT, input.text);
  }
}
