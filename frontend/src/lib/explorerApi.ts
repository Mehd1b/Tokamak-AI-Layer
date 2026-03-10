/**
 * Etherscan V2 API client for fetching vault event logs.
 *
 * Uses the unified Etherscan V2 endpoint (api.etherscan.io/v2/api?chainid=...)
 * which supports HyperEVM (999), Ethereum (1), Sepolia (11155111), and others.
 *
 * One API call returns ALL events for a vault address — no block range limits,
 * no pagination headaches, works for vaults of any age.
 */
import { keccak256, toBytes, decodeEventLog, decodeFunctionData, hexToBytes } from 'viem';
import {
  executionAppliedEvent,
  optimisticExecutionSubmittedEvent,
  proofSubmittedEvent,
  executionSlashedEvent,
  actionExecutedEvent,
  noOpActionExecutedEvent,
  depositEvent,
  withdrawEvent,
  vaultDeployedEvent,
  optimisticVaultDeployedEvent,
} from './vaultEvents';

const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface EtherscanLogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  gasPrice: string;
  gasUsed: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: EtherscanLogEntry[] | string;
}

export interface DecodedVaultLog {
  eventName: string;
  args: Record<string, any>;
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
  timeStamp: number;
}

export interface VaultLogs {
  executions: DecodedVaultLog[];
  optimisticSubmissions: DecodedVaultLog[];
  proofs: DecodedVaultLog[];
  slashes: DecodedVaultLog[];
  actions: DecodedVaultLog[];
  deposits: DecodedVaultLog[];
  withdrawals: DecodedVaultLog[];
}

// ── Event topic mapping ────────────────────────────────────────────────────

const VAULT_EVENTS = [
  executionAppliedEvent,
  optimisticExecutionSubmittedEvent,
  proofSubmittedEvent,
  executionSlashedEvent,
  actionExecutedEvent,
  noOpActionExecutedEvent,
  depositEvent,
  withdrawEvent,
] as const;

/** Pre-computed topic0 → event ABI lookup for O(1) decoding. */
const topic0Map = new Map<string, (typeof VAULT_EVENTS)[number]>();
for (const evt of VAULT_EVENTS) {
  const sig = `${evt.name}(${evt.inputs.map((i) => i.type).join(',')})`;
  topic0Map.set(keccak256(toBytes(sig)), evt);
}

const EVENT_NAME_TO_CATEGORY: Record<string, keyof VaultLogs> = {
  ExecutionApplied: 'executions',
  OptimisticExecutionSubmitted: 'optimisticSubmissions',
  ProofSubmitted: 'proofs',
  ExecutionSlashed: 'slashes',
  ActionExecuted: 'actions',
  NoOpActionExecuted: 'actions',
  Deposit: 'deposits',
  Withdraw: 'withdrawals',
};

// ── Core fetcher ───────────────────────────────────────────────────────────

function getApiKey(): string | null {
  return typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? null)
    : null;
}

/** Returns true if the Etherscan explorer API is available (API key configured). */
export function isExplorerAvailable(): boolean {
  return !!getApiKey();
}

async function etherscanGetLogs(
  chainId: number,
  address: string,
  params: Record<string, string> = {},
): Promise<EtherscanLogEntry[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('NEXT_PUBLIC_ETHERSCAN_API_KEY not set');

  const url = `${ETHERSCAN_V2_BASE}?${new URLSearchParams({
    chainid: String(chainId),
    module: 'logs',
    action: 'getLogs',
    address,
    fromBlock: '0',
    toBlock: '99999999',
    sort: 'asc',
    apikey: apiKey,
    ...params,
  })}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer API HTTP ${res.status}`);

  const data: EtherscanResponse = await res.json();

  if (data.status === '1' && Array.isArray(data.result)) {
    return data.result;
  }

  // "No records found" is not an error — just empty results
  if (
    typeof data.result === 'string' &&
    (data.result.includes('No records') || data.result.includes('No transactions'))
  ) {
    return [];
  }

  throw new Error(`Explorer API: ${data.result}`);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch ALL event logs for a vault via Etherscan V2 API.
 * Returns categorized decoded events. One HTTP call, no block range limits.
 */
export async function fetchVaultLogs(
  chainId: number,
  vaultAddress: `0x${string}`,
): Promise<VaultLogs> {
  const entries = await etherscanGetLogs(chainId, vaultAddress);

  const result: VaultLogs = {
    executions: [],
    optimisticSubmissions: [],
    proofs: [],
    slashes: [],
    actions: [],
    deposits: [],
    withdrawals: [],
  };

  for (const entry of entries) {
    const topic0 = entry.topics[0];
    if (!topic0) continue;

    const eventAbi = topic0Map.get(topic0.toLowerCase());
    if (!eventAbi) continue; // Unknown event, skip

    try {
      const decoded = decodeEventLog({
        abi: [eventAbi],
        topics: entry.topics as [`0x${string}`, ...`0x${string}`[]],
        data: entry.data as `0x${string}`,
      });

      const log: DecodedVaultLog = {
        eventName: decoded.eventName,
        args: decoded.args as Record<string, any>,
        blockNumber: BigInt(entry.blockNumber),
        transactionHash: entry.transactionHash,
        logIndex: parseInt(entry.logIndex, 16) || 0,
        timeStamp: parseInt(entry.timeStamp, 16) || 0,
      };

      const category = EVENT_NAME_TO_CATEGORY[decoded.eventName];
      if (category) result[category].push(log);
    } catch {
      // Decoding failed — event ABI mismatch, skip
    }
  }

  return result;
}

/**
 * Find the vault deploy block via Etherscan V2 API.
 * Searches VaultDeployed and OptimisticVaultDeployed events from the factory.
 */
export async function findDeployBlockViaExplorer(
  chainId: number,
  factoryAddress: `0x${string}`,
  vaultAddress: `0x${string}`,
): Promise<bigint> {
  const deployEvents = [vaultDeployedEvent, optimisticVaultDeployedEvent];

  for (const evt of deployEvents) {
    const sig = `${evt.name}(${evt.inputs.map((i) => i.type).join(',')})`;
    const topic0 = keccak256(toBytes(sig));

    // The vault address is always the first indexed param (topic1), padded to 32 bytes
    const topic1 = ('0x' + vaultAddress.slice(2).toLowerCase().padStart(64, '0')) as string;

    try {
      const entries = await etherscanGetLogs(chainId, factoryAddress, {
        topic0,
        topic0_1_opr: 'and',
        topic1,
        page: '1',
        offset: '1',
      });

      if (entries.length > 0) {
        return BigInt(entries[0].blockNumber);
      }
    } catch {
      // Try next event type
    }
  }

  return BigInt(0);
}

// ── Action name resolution from tx calldata ────────────────────────────────

/** Known function signatures → human-readable names. */
const KNOWN_FUNCTIONS: Array<[string, string]> = [
  // HyperliquidAdapter
  ['openPosition(bool,uint256,uint256,uint256)', 'Open Position'],
  ['closePosition()', 'Close Position'],
  ['closePositionAtPrice(uint64)', 'Close Position'],
  ['closePositionAtPriceAdmin(address,uint64)', 'Close Position'],
  ['closePositionAdmin(address)', 'Close Position'],
  ['depositMargin(uint256)', 'Deposit Margin'],
  ['depositMarginAdmin(address,uint256)', 'Deposit Margin'],
  ['depositMarginFromVaultAdmin(address,uint256)', 'Deposit Margin'],
  ['depositSubBalanceAdmin(address)', 'Deposit Balance'],
  ['withdrawToVault()', 'Withdraw to Vault'],
  ['withdrawToVaultAdmin(address)', 'Withdraw to Vault'],
  ['fundSubAccountHype(address)', 'Fund HYPE Gas'],
  ['registerVault(address,uint32,uint8)', 'Register Vault'],
  ['transferPerpToSpot(address,uint64)', 'Perp to Spot'],
  ['transferSpotToEvm(address,uint64)', 'Spot to EVM'],
  // ERC20
  ['transfer(address,uint256)', 'ERC20 Transfer'],
  ['approve(address,uint256)', 'ERC20 Approve'],
  // Vault
  ['rescueTokens(address,address,uint256)', 'Rescue Tokens'],
];

/** Pre-computed 4-byte selector → display name. */
const SELECTOR_MAP = new Map<string, string>();
for (const [sig, name] of KNOWN_FUNCTIONS) {
  const selector = keccak256(toBytes(sig)).slice(0, 10).toLowerCase();
  SELECTOR_MAP.set(selector, name);
}

/** Action types from KernelVault.sol */
const ACTION_TYPE_CALL = 2;
const ACTION_TYPE_TRANSFER_ERC20 = 3;
const ACTION_TYPE_NO_OP = 4;

export interface ParsedAction {
  actionType: number;
  label: string;
}

/** Read a u32 little-endian from a Uint8Array. */
function readU32LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
}

/**
 * Parse the binary agentOutput to extract action info.
 * Format: action_count(u32 LE) + N × [action_type(u32 LE) + target(32B) + payload_len(u32 LE) + payload]
 */
function parseAgentOutput(data: Uint8Array): ParsedAction[] {
  if (data.length < 4) return [];

  const actionCount = readU32LE(data, 0);
  const actions: ParsedAction[] = [];
  let offset = 4;

  for (let i = 0; i < actionCount && offset + 4 <= data.length; i++) {
    // Read action_len prefix (u32 LE) — total size of the ActionV1 encoding that follows
    const actionLen = readU32LE(data, offset);
    offset += 4;

    if (offset + actionLen > data.length) break;

    // ActionV1: action_type(u32 LE) + target(32B) + payload_len(u32 LE) + payload
    if (actionLen < 40) break; // minimum: 4 + 32 + 4

    const actionType = readU32LE(data, offset);
    // skip action_type (4) + target (32)
    const payloadLen = readU32LE(data, offset + 4 + 32);
    const payloadStart = offset + 4 + 32 + 4;

    let label: string;
    if (actionType === ACTION_TYPE_CALL && payloadLen >= 100 && payloadStart + 100 <= data.length) {
      // CALL payload is abi.encode(uint256 value, bytes callData):
      //   bytes 0-31:  uint256 value
      //   bytes 32-63: offset to callData (= 64)
      //   bytes 64-95: callData length
      //   bytes 96+:   callData (starts with 4-byte function selector)
      const selectorOffset = payloadStart + 96;
      const selector = '0x' + Array.from(data.slice(selectorOffset, selectorOffset + 4))
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      label = SELECTOR_MAP.get(selector.toLowerCase()) ?? `Call (${selector})`;
    } else if (actionType === ACTION_TYPE_TRANSFER_ERC20) {
      label = 'ERC20 Transfer';
    } else if (actionType === ACTION_TYPE_NO_OP) {
      label = 'No-Op';
    } else {
      label = `Action(${actionType})`;
    }

    offset += actionLen;
    actions.push({ actionType, label });
  }

  return actions;
}

/** ABI for vault execute functions — must match actual Solidity signatures exactly. */
const EXECUTE_ABI = [
  {
    name: 'execute',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'journal', type: 'bytes' as const },
      { name: 'seal', type: 'bytes' as const },
      { name: 'agentOutputBytes', type: 'bytes' as const },
    ],
    outputs: [],
  },
  {
    name: 'executeWithOracle',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'journal', type: 'bytes' as const },
      { name: 'seal', type: 'bytes' as const },
      { name: 'agentOutputBytes', type: 'bytes' as const },
      { name: 'oracleSignature', type: 'bytes' as const },
      { name: 'oracleTimestamp', type: 'uint64' as const },
    ],
    outputs: [],
  },
  {
    name: 'executeOptimistic',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'journal', type: 'bytes' as const },
      { name: 'agentOutputBytes', type: 'bytes' as const },
      { name: 'oracleSignature', type: 'bytes' as const },
      { name: 'oracleTimestamp', type: 'uint64' as const },
      { name: 'bondAmount', type: 'uint256' as const },
      { name: 'bondAttestation', type: 'bytes' as const },
    ],
    outputs: [],
  },
] as const;

/** agentOutputBytes parameter index for each execute variant. */
const AGENT_OUTPUT_INDEX: Record<string, number> = {
  execute: 2,
  executeWithOracle: 2,
  executeOptimistic: 1,
};

/**
 * Decode an execute/executeWithOracle/executeOptimistic tx input → extract agentOutput → parse actions.
 * Returns [] if the tx isn't an execute call or parsing fails.
 */
export function decodeExecuteTxActions(input: string): ParsedAction[] {
  if (!input || input.length < 10) return [];
  try {
    const decoded = decodeFunctionData({ abi: EXECUTE_ABI, data: input as `0x${string}` });
    const idx = AGENT_OUTPUT_INDEX[decoded.functionName] ?? 2;
    const agentOutput = decoded.args[idx] as `0x${string}`;
    return parseAgentOutput(hexToBytes(agentOutput));
  } catch {
    return [];
  }
}

interface EtherscanTxEntry {
  hash: string;
  input: string;
  methodId: string;
  functionName: string;
  isError: string;
}

/**
 * Fetch all transactions to a vault, decode execute() calls, and return
 * a map of txHash → ParsedAction[].
 */
export async function fetchVaultTxActions(
  chainId: number,
  vaultAddress: `0x${string}`,
): Promise<Map<string, ParsedAction[]>> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('NEXT_PUBLIC_ETHERSCAN_API_KEY not set');

  const url = `${ETHERSCAN_V2_BASE}?${new URLSearchParams({
    chainid: String(chainId),
    module: 'account',
    action: 'txlist',
    address: vaultAddress,
    startblock: '0',
    endblock: '99999999',
    sort: 'asc',
    apikey: apiKey,
  })}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer API HTTP ${res.status}`);
  const data = await res.json();

  const map = new Map<string, ParsedAction[]>();

  if (data.status !== '1' || !Array.isArray(data.result)) return map;

  for (const tx of data.result as EtherscanTxEntry[]) {
    if (tx.isError === '1') continue;
    const actions = decodeExecuteTxActions(tx.input);
    if (actions.length > 0) {
      map.set(tx.hash.toLowerCase(), actions);
    }
  }

  return map;
}
