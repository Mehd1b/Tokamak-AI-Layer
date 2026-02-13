import "dotenv/config";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { thanosSepolia } from "../../packages/shared/src/chains.js";
import { THANOS_SEPOLIA_ADDRESSES } from "../../packages/shared/src/addresses.js";
import { TALIdentityRegistryABI } from "../../packages/shared/src/abi/TALIdentityRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, ".agent-state.json");
const DATA_DIR = resolve(__dirname, ".data");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function retry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.log(`  ⟳ ${label} failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new Error("unreachable");
}

function loadState(): Record<string, unknown> {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  }
  return {};
}

function saveState(state: Record<string, unknown>): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

const AGENT_METADATA = {
  name: "DeFi Yield Strategy Agent",
  version: "1.0.0",
  description: "Risk-adjusted yield farming strategy generation with StakeSecured validation",
  capabilities: ["yield-analysis", "risk-scoring", "portfolio-optimization"],
  supportedProtocols: ["aave-v3", "compound-v3", "uniswap-v3", "curve", "lido", "tokamak-staking"],
  supportedChains: [1, 10, 42161, 111551119090],
  pricing: {
    basic: "0.5 TON",
    advanced: "2 TON",
    premium: "5 TON",
  },
  validationModel: "StakeSecured",
  contact: "https://github.com/tokamak-network/tal-yield-agent",
};

async function main() {
  console.log("\n▶ Step 2: Agent Registration\n");

  const rpcUrl = process.env.RPC_URL!;
  const privKey = process.env.OPERATOR_PRIVATE_KEY!;
  if (!rpcUrl || !privKey) throw new Error("RPC_URL and OPERATOR_PRIVATE_KEY required in .env");

  const account = privateKeyToAccount(privKey as Hex);
  const publicClient = createPublicClient({
    chain: thanosSepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: thanosSepolia,
    transport: http(rpcUrl),
  });

  // --- 1. Check if already registered ---
  const existingAgents = await retry(
    () =>
      publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
        abi: TALIdentityRegistryABI,
        functionName: "getAgentsByOwner",
        args: [account.address],
      }),
    "getAgentsByOwner",
  ) as bigint[];

  if (existingAgents.length > 0) {
    // Use the most recent agent
    const agentId = existingAgents[existingAgents.length - 1]!;

    // Read its metadata URI
    const metadataURI = await retry(
      () =>
        publicClient.readContract({
          address: THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
          abi: TALIdentityRegistryABI,
          functionName: "agentURI",
          args: [agentId],
        }),
      "agentURI",
    ) as string;

    // Read operator
    const operator = await retry(
      () =>
        publicClient.readContract({
          address: THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
          abi: TALIdentityRegistryABI,
          functionName: "getOperator",
          args: [agentId],
        }),
      "getOperator",
    ) as string;

    console.log(`  ℹ️  Agent already registered — skipping registration`);
    console.log(`  ✅ Agent exists`);
    console.log(`     Agent ID: ${agentId}`);
    console.log(`     All owned agents: [${existingAgents.join(", ")}]`);
    console.log(`     Metadata URI: ${metadataURI}`);
    console.log(`     Operator: ${operator}`);
    console.log(`     Owner: ${account.address}`);

    // Save state
    const state = loadState();
    saveState({
      ...state,
      agentId: agentId.toString(),
      metadataURI,
      operator,
      owner: account.address,
      registeredAt: new Date().toISOString(),
      txHash: "pre-existing",
    });

    console.log(`\n  State saved to ${STATE_FILE}\n`);
    return;
  }

  // --- 2. Save metadata locally (IPFS fallback) ---
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const metadataPath = resolve(DATA_DIR, "agent-metadata.json");
  writeFileSync(metadataPath, JSON.stringify(AGENT_METADATA, null, 2));
  const metadataURI = "ipfs://placeholder-will-update";
  console.log(`  Metadata saved to ${metadataPath}`);
  console.log(`  Using placeholder URI: ${metadataURI}`);

  // --- 3. Register on-chain ---
  console.log(`  Submitting register() transaction...`);
  const { request } = await retry(
    () =>
      publicClient.simulateContract({
        address: THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
        abi: TALIdentityRegistryABI,
        functionName: "register",
        args: [metadataURI],
        account: account,
      }),
    "simulateContract(register)",
  );

  const txHash = await walletClient.writeContract(request);
  console.log(`  Tx submitted: ${txHash}`);

  const receipt = await retry(
    () => publicClient.waitForTransactionReceipt({ hash: txHash }),
    "waitForTransactionReceipt",
  );
  console.log(`  Tx confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);

  // --- 4. Extract agent ID from event ---
  let agentId: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: TALIdentityRegistryABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Registered") {
        agentId = (decoded.args as { agentId: bigint }).agentId;
        break;
      }
    } catch {
      // Not our event, skip
    }
  }

  if (!agentId) {
    // Fallback: query getAgentsByOwner again
    const agents = await publicClient.readContract({
      address: THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
      abi: TALIdentityRegistryABI,
      functionName: "getAgentsByOwner",
      args: [account.address],
    }) as bigint[];
    agentId = agents[agents.length - 1]!;
  }

  console.log(`\n  ✅ Agent registered`);
  console.log(`     Agent ID: ${agentId}`);
  console.log(`     Metadata URI: ${metadataURI}`);
  console.log(`     Operator: ${account.address}`);
  console.log(`     Tx hash: ${txHash}`);

  // --- 5. Save state ---
  const state = loadState();
  saveState({
    ...state,
    agentId: agentId.toString(),
    metadataURI,
    operator: account.address,
    owner: account.address,
    registeredAt: new Date().toISOString(),
    txHash,
    registrationBlock: receipt.blockNumber.toString(),
    registrationGas: receipt.gasUsed.toString(),
  });

  console.log(`\n  State saved to ${STATE_FILE}\n`);
}

main().catch((err) => {
  console.error("\n❌ Agent registration FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});
