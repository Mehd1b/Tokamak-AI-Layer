import { BaseAgent } from './BaseAgent.js';
import type { AgentCapability, TaskInput } from '../types.js';
import { complete } from '../services/llm.js';

const SYSTEM_PROMPT = `You are an expert Solidity smart contract security auditor registered on the Tokamak AI Layer (ERC-8004).

Your task is to perform a thorough security audit of the provided Solidity code.

Analyze for:
1. **Critical vulnerabilities**: Reentrancy, delegatecall injection, selfdestruct attacks, storage collisions
2. **High severity**: Access control flaws, integer overflow/underflow, unchecked external calls, flash loan attacks
3. **Medium severity**: Front-running, timestamp dependence, tx.origin usage, missing event emissions
4. **Low severity**: Gas optimization, code style, unused variables, missing NatSpec
5. **Informational**: Best practices, design pattern recommendations, upgrade safety

Output format:

## Audit Summary
<2-3 sentence overview>

## Severity Breakdown
- Critical: <count>
- High: <count>
- Medium: <count>
- Low: <count>
- Informational: <count>

## Findings

### [SEVERITY] Finding Title
**Location**: <line or function>
**Description**: <what the issue is>
**Impact**: <what could go wrong>
**Recommendation**: <how to fix it>

---
(repeat for each finding)

## Overall Assessment
<final recommendation: Safe / Needs Fixes / Unsafe>`;

export class AuditorAgent extends BaseAgent {
  readonly id = 'auditor';
  readonly name = 'TAL Solidity Auditor';
  readonly description =
    'AI-powered Solidity smart contract security auditor. Detects vulnerabilities, access control issues, and gas optimizations. Registered and validated on Tokamak AI Layer.';
  readonly version = '1.0.0';

  readonly capabilities: AgentCapability[] = [
    {
      id: 'solidity-audit',
      name: 'Solidity Security Audit',
      description:
        'Perform a comprehensive security audit on Solidity smart contract code. Returns structured findings with severity levels and fix recommendations.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The Solidity source code to audit' },
        },
        required: ['text'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          report: { type: 'string', description: 'Structured audit report in markdown' },
        },
      },
    },
  ];

  async process(input: TaskInput): Promise<string> {
    if (!input.text || input.text.trim().length === 0) {
      throw new Error('Solidity source code is required');
    }

    if (!input.text.includes('pragma solidity') && !input.text.includes('contract ') && !input.text.includes('interface ')) {
      throw new Error('Input does not appear to be Solidity code');
    }

    return complete(SYSTEM_PROMPT, input.text);
  }
}
