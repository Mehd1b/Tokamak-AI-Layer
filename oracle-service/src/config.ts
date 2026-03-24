import { parseAbi } from 'viem';
import 'dotenv/config';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  databaseUrl: requireEnv('DATABASE_URL'),

  // Keys
  bondOraclePrivateKey: requireEnv('BOND_ORACLE_PRIVATE_KEY') as `0x${string}`,
  priceOraclePrivateKey: requireEnv('PRICE_ORACLE_PRIVATE_KEY') as `0x${string}`,
  relayerPrivateKey: requireEnv('RELAYER_PRIVATE_KEY') as `0x${string}`,

  // RPC
  ethRpcUrl: requireEnv('ETH_RPC_URL'),
  hyperRpcUrl: requireEnv('HYPER_RPC_URL'),
  hyperTestnetRpcUrl: process.env.HYPER_TESTNET_RPC_URL || '',

  // Contracts
  wstonBondManager: requireEnv('WSTON_BOND_MANAGER') as `0x${string}`,
  vaultFactoryHyper: requireEnv('VAULT_FACTORY_HYPER') as `0x${string}`,
  vaultFactoryEth: requireEnv('VAULT_FACTORY_ETH') as `0x${string}`,
  vaultFactoryHyperTestnet: (process.env.VAULT_FACTORY_HYPER_TESTNET || '') as `0x${string}`,

  // Config
  confirmationDepth: parseInt(process.env.CONFIRMATION_DEPTH || '10'),
  maxOracleAge: parseInt(process.env.MAX_ORACLE_AGE || '900'),
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '10'),
  adminApiKey: process.env.ADMIN_API_KEY || '',

  // Scan start blocks (avoid scanning from genesis)
  scanStartBlockHyper: BigInt(process.env.SCAN_START_BLOCK_HYPER || '0'),
  scanStartBlockEth: BigInt(process.env.SCAN_START_BLOCK_ETH || '0'),
  scanStartBlockHyperTestnet: BigInt(process.env.SCAN_START_BLOCK_HYPER_TESTNET || '0'),
} as const;

// ============ ABIs ============

export const VaultFactoryAbi = parseAbi([
  'event OptimisticVaultDeployed(address indexed vault, bytes32 indexed agentId, address indexed owner, uint256 bondChainId)',
  'event ExternalVaultRegistered(address indexed vault, bytes32 indexed agentId)',
  'event VaultDeployed(address indexed vault, bytes32 indexed agentId, address indexed owner, bytes32 trustedImageId, bytes32 salt)',
  'function vaultCount() view returns (uint256)',
]);

export const WSTONBondManagerAbi = parseAbi([
  'function bonds(address operator, address vault, uint64 nonce) view returns (uint256 amount, uint256 lockedAt, uint8 status)',
  'function releaseBondByRelayer(address operator, address vault, uint64 nonce)',
  'function slashBondByRelayer(address operator, address vault, uint64 nonce, address slasher)',
  'function trustedRelayer() view returns (address)',
  'event BondLocked(address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount)',
  'event CrossChainBondLocked(address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount)',
]);

export const OptimisticKernelVaultAbi = parseAbi([
  'event ProofSubmitted(uint64 indexed executionNonce, address prover)',
  'event ExecutionSlashed(uint64 indexed executionNonce, address slasher, uint256 bondAmount)',
  'event OptimisticExecutionSubmitted(uint64 indexed executionNonce, bytes32 journalHash, uint256 bondAmount, uint256 deadline)',
  'function owner() view returns (address)',
  'function optimisticEnabled() view returns (bool)',
  'function bondChainId() view returns (uint256)',
]);
