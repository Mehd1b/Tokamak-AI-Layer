import { createPublicClient, createWalletClient, http, parseAbi, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { optimismSepolia } from 'viem/chains';
import { config } from '../config.js';

const VALIDATION_ABI = parseAbi([
  'function requestValidation(uint256 agentId, bytes32 taskHash, bytes32 outputHash, uint8 model, uint256 deadline) external payable returns (bytes32)',
  'function submitValidation(bytes32 requestHash, uint8 score, bytes calldata proof, string calldata detailsURI) external',
  'function getValidation(bytes32 requestHash) external view returns ((uint256 agentId, address requester, bytes32 taskHash, bytes32 outputHash, uint8 model, uint256 bounty, uint256 deadline, uint8 status, address validator, uint8 score, bytes proof, string detailsURI))',
  'function selectValidator(bytes32 requestHash, address[] calldata candidates) external',
  'function getSelectedValidator(bytes32 requestHash) external view returns (address)',
  'function getAgentValidations(uint256 agentId) external view returns (bytes32[])',
]);

const registryAddress = config.VALIDATION_REGISTRY as Address;

const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(config.RPC_URL),
});

function getWalletClient() {
  if (!config.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY is required for write operations');
  }
  const account = privateKeyToAccount(config.PRIVATE_KEY as Hex);
  return createWalletClient({
    account,
    chain: optimismSepolia,
    transport: http(config.RPC_URL),
  });
}

export async function requestValidation(
  agentId: bigint,
  taskHash: Hex,
  outputHash: Hex,
  model: number,
  deadline: bigint,
  bountyWei: bigint,
): Promise<{ requestHash: string; txHash: string }> {
  const wallet = getWalletClient();
  const txHash = await wallet.writeContract({
    address: registryAddress,
    abi: VALIDATION_ABI,
    functionName: 'requestValidation',
    args: [agentId, taskHash, outputHash, model, deadline],
    value: bountyWei,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  // Extract requestHash from logs (first topic of first log)
  const requestHash = receipt.logs[0]?.topics[1] || txHash;
  return { requestHash: requestHash as string, txHash };
}

export async function submitValidationOnChain(
  requestHash: Hex,
  score: number,
  proof: Hex,
  detailsURI: string,
): Promise<{ txHash: string }> {
  const wallet = getWalletClient();
  const txHash = await wallet.writeContract({
    address: registryAddress,
    abi: VALIDATION_ABI,
    functionName: 'submitValidation',
    args: [requestHash, score, proof, detailsURI],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

export async function getValidation(requestHash: Hex) {
  const result = await publicClient.readContract({
    address: registryAddress,
    abi: VALIDATION_ABI,
    functionName: 'getValidation',
    args: [requestHash],
  });
  return result;
}

export async function getAgentValidations(agentId: bigint): Promise<string[]> {
  const result = await publicClient.readContract({
    address: registryAddress,
    abi: VALIDATION_ABI,
    functionName: 'getAgentValidations',
    args: [agentId],
  });
  return result as string[];
}

export async function selectValidator(requestHash: Hex, candidates: Address[]): Promise<{ txHash: string }> {
  const wallet = getWalletClient();
  const txHash = await wallet.writeContract({
    address: registryAddress,
    abi: VALIDATION_ABI,
    functionName: 'selectValidator',
    args: [requestHash, candidates],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

export async function getSelectedValidator(requestHash: Hex): Promise<string> {
  const result = await publicClient.readContract({
    address: registryAddress,
    abi: VALIDATION_ABI,
    functionName: 'getSelectedValidator',
    args: [requestHash],
  });
  return result as string;
}
