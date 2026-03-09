# Oracle Service Implementation Prompt

You are two senior engineers working as a team:

**Engineer A — Full-Stack Backend Developer** (10+ years experience with Node.js/TypeScript, REST APIs, event-driven architectures, cloud deployment, and key management systems)

**Engineer B — Blockchain Developer** (10+ years experience with Solidity, EVM chains, ethers.js/viem, cross-chain bridges, and oracle systems)

Your task: Implement and deploy the oracle backend service for the Tokamak AI Layer optimistic execution protocol. This service is the critical infrastructure that enables cross-chain bond-backed optimistic execution between Ethereum L1 and HyperEVM (chain 999).

---

## Step 1: Read and Understand the Architecture

Before writing any code, read the full `OPTIMISTIC_EXECUTION.md` documentation at `contracts/src/OPTIMISTIC_EXECUTION.md`. Pay special attention to the **"Oracle & Relayer Architecture"** section. Understand:

1. **Why the oracle exists**: The protocol decouples ZK proof generation from action execution. Actions execute immediately (optimistic), backed by WSTON bonds on Ethereum L1. The oracle bridges trust between chains — it attests that bonds were locked on L1 before allowing optimistic execution on HyperEVM.

2. **The two oracle roles**:
   - **Role A (Price Feed Oracle)**: Signs `keccak256(feedHash || timestamp || chainId || vaultAddress)` — attests input data freshness. Optional, medium-trust.
   - **Role B (Bond Attestation Oracle)**: Signs `keccak256("BOND_LOCK_V1" || operator || vault || nonce || amount || chainId)` — attests L1 bond lock. Required, high-trust.

3. **The relayer role**: Monitors HyperEVM events (`ProofSubmitted`, `ExecutionSlashed`) on **all** OptimisticKernelVaults and relays them to Ethereum L1 by calling `releaseBondByRelayer()` or `slashBondByRelayer()` on WSTONBondManager.

4. **Multi-vault architecture**: Anyone can deploy an OptimisticKernelVault via `VaultFactory.deployOptimisticVault()`. The oracle must **dynamically discover** new vaults by listening to `OptimisticVaultDeployed` events on VaultFactory, then subscribe to events on each vault. The oracle does NOT hardcode vault addresses.

5. **The signature formats**: Exact EIP-191 signing formats used by `OracleVerifier.sol` on-chain (provided below).

---

## Step 2: Implement the Oracle Service

Build a production-ready TypeScript backend service with four modules:

### Module 1: Vault Registry (Dynamic Discovery)

**Long-running service** — the foundation for all other modules:

1. On startup, query all existing optimistic vaults from VaultFactory:
   - Scan historical `OptimisticVaultDeployed(address indexed vault, bytes32 indexed agentId, address indexed owner, uint256 bondChainId)` events from VaultFactory on HyperEVM.
   - Store each vault's `{ address, agentId, owner, bondChainId, chainId }` in a persistent registry (PostgreSQL).

2. Subscribe to new `OptimisticVaultDeployed` events in real-time on VaultFactory.
   - When a new vault is deployed, add it to the registry and **dynamically start** event listeners for Module 3 (relayer) on the new vault.

3. The VaultFactory exists on **multiple chains** (HyperEVM mainnet chain 999 and potentially Ethereum mainnet chain 1). The registry must track which chain each vault lives on.

4. Provide an internal API for other modules to query:
   - `getVaults()` → all registered vaults
   - `getVault(address, chainId)` → vault info
   - `isRegisteredVault(address, chainId)` → boolean

**VaultFactory addresses:**

| Chain | Address |
|-------|---------|
| HyperEVM (999) | `0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB` |
| Ethereum (1) | `0x9cF9828Fd6253Df7C9497fd06Fa531E0CCc1d822` |

### Module 2: Bond Attestation Oracle (Role B)

**Endpoint**: `POST /api/v1/attest-bond`

**Flow**:
1. Receive request: `{ operator, vault, nonce, amount, chainId }`
2. **Validate vault**: Check the vault registry — the vault address must be a registered OptimisticKernelVault deployed by VaultFactory. Reject requests for unknown vaults. This prevents signing attestations for rogue contracts.
3. **Verify on L1**: Query `WSTONBondManager.bonds(operator, vault, nonce)` on Ethereum mainnet. Confirm status is `Locked` and `amount` matches.
4. **Sign attestation**: Compute `keccak256(abi.encodePacked("BOND_LOCK_V1", operator, vault, nonce, amount, chainId))`, then EIP-191 sign with `\x19Ethereum Signed Message:\n32` prefix.
5. Return: `{ attestation: "0x...(65 bytes r||s||v)", bondHash: "0x...", signer: "0x..." }`

**Critical**: This MUST verify the bond exists on-chain AND the vault is registered before signing. A false attestation enables unbonded execution (vault drain). Rate limit: max 10 requests/minute per operator.

### Module 3: Cross-Chain Relayer (Multi-Vault)

**Long-running service** — monitors ALL registered OptimisticKernelVaults:

1. For each vault in the registry, subscribe to events:
   - `ProofSubmitted(uint64 indexed executionNonce, address prover)` → call `releaseBondByRelayer(operator, vault, nonce)` on L1
   - `ExecutionSlashed(uint64 indexed executionNonce, address slasher, uint256 bondAmount)` → call `slashBondByRelayer(operator, vault, nonce, slasher)` on L1

2. **Dynamic subscription**: When Module 1 (Vault Registry) discovers a new vault, the relayer must start listening to it immediately — no restart required.

3. **Multi-vault event aggregation**: Use a single WebSocket/polling connection per chain, filtering for events across all vault addresses. As the number of vaults grows, avoid opening one connection per vault. Instead:
   - Batch event queries with multiple addresses in a single `eth_getLogs` call
   - Or use a single subscription with a topic filter and match vault addresses locally

4. **Idempotency**: Track processed events by `(vaultAddress, chainId, eventHash)` in PostgreSQL. Never relay the same event twice.

5. **Historical replay**: On startup, for each vault, scan from its last checkpoint block to head. Process any missed events.

6. **Confirmation depth**: Wait 10 blocks on HyperEVM before relaying (reorg safety).

7. **Retry logic**: If L1 transaction fails, retry with exponential backoff (max 5 retries). Alert on permanent failure.

8. **Operator resolution**: Map `(vault, nonce)` → `operator` by indexing `BondLocked` events from WSTONBondManager on L1, or by querying the bond storage directly: `WSTONBondManager.bonds(operator, vault, nonce)`. Since the operator is not in the HyperEVM events, maintain a local index of `OptimisticExecutionSubmitted` events which include the vault address — the vault's `owner()` is the operator.

### Module 4: Price Feed Oracle (Role A) — Optional

**Endpoint**: `POST /api/v1/sign-feed`

**Flow**:
1. Receive request: `{ feedHash, timestamp, chainId, vaultAddress }`
2. **Validate vault**: Check the vault registry — the vault must be registered.
3. Validate timestamp is within `maxOracleAge` (900s) of current time
4. Sign: `keccak256(abi.encodePacked(feedHash, timestamp, chainId, vaultAddress))` with EIP-191 prefix
5. Return: `{ signature: "0x...(65 bytes)", signer: "0x..." }`

---

## Step 3: Deploy the Backend

Engineer A deploys the service with:

1. **Environment configuration**:
   ```
   # Oracle Keys (separate keys for Role A and Role B)
   BOND_ORACLE_PRIVATE_KEY=
   PRICE_ORACLE_PRIVATE_KEY=

   # Relayer Key
   RELAYER_PRIVATE_KEY=

   # RPC Endpoints
   ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/..
   HYPER_RPC_URL=https://hyperliquid-mainnet.g.alchemy.com/v2/..

   # Contract Addresses
   WSTON_BOND_MANAGER=0x46a92cDC8530fd1C4D46891625a718458856Bc14
   VAULT_FACTORY_HYPER=0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB
   VAULT_FACTORY_ETH=0x9cF9828Fd6253Df7C9497fd06Fa531E0CCc1d822

   # Configuration
   CONFIRMATION_DEPTH=10
   MAX_ORACLE_AGE=900
   RATE_LIMIT_PER_MINUTE=10
   PORT=3000
   DATABASE_URL=postgresql://oracle:password@db:5432/oracle_service
   ```

2. **Project structure**:
   ```
   oracle-service/
   ├── src/
   │   ├── index.ts                  # Entry: start API + vault registry + relayer
   │   ├── api/
   │   │   ├── server.ts             # Express/Fastify HTTP server
   │   │   ├── bond-attestation.ts   # POST /api/v1/attest-bond
   │   │   └── price-feed.ts         # POST /api/v1/sign-feed
   │   ├── registry/
   │   │   ├── vault-registry.ts     # Dynamic vault discovery from VaultFactory events
   │   │   └── vault-store.ts        # PostgreSQL persistence for vault registry
   │   ├── relayer/
   │   │   ├── multi-vault-listener.ts  # Aggregated event subscription across all vaults
   │   │   ├── relay-executor.ts     # L1 transaction submission
   │   │   └── checkpoint.ts         # Per-vault block tracking
   │   ├── signing/
   │   │   ├── bond-signer.ts        # EIP-191 bond attestation signing
   │   │   └── feed-signer.ts        # EIP-191 price feed signing
   │   ├── verification/
   │   │   └── l1-verifier.ts        # On-chain bond status verification
   │   ├── db/
   │   │   ├── migrations/           # SQL migrations
   │   │   └── client.ts             # Database connection
   │   └── config.ts                 # Environment + contract ABIs
   ├── package.json
   ├── tsconfig.json
   ├── Dockerfile
   └── docker-compose.yml
   ```

3. **Database schema** (PostgreSQL):
   ```sql
   -- Registered optimistic vaults
   CREATE TABLE vaults (
     address TEXT NOT NULL,
     chain_id INTEGER NOT NULL,
     agent_id TEXT NOT NULL,
     owner TEXT NOT NULL,
     bond_chain_id INTEGER NOT NULL,
     discovered_at TIMESTAMP DEFAULT NOW(),
     PRIMARY KEY (address, chain_id)
   );

   -- Relayed events (idempotency)
   CREATE TABLE relayed_events (
     vault_address TEXT NOT NULL,
     chain_id INTEGER NOT NULL,
     event_hash TEXT NOT NULL UNIQUE,
     event_type TEXT NOT NULL,  -- 'ProofSubmitted' or 'ExecutionSlashed'
     execution_nonce BIGINT NOT NULL,
     l1_tx_hash TEXT,
     status TEXT DEFAULT 'pending',  -- pending, relayed, failed
     created_at TIMESTAMP DEFAULT NOW(),
     relayed_at TIMESTAMP
   );

   -- Per-vault checkpoint for historical replay
   CREATE TABLE checkpoints (
     vault_address TEXT NOT NULL,
     chain_id INTEGER NOT NULL,
     last_block BIGINT NOT NULL,
     updated_at TIMESTAMP DEFAULT NOW(),
     PRIMARY KEY (vault_address, chain_id)
   );
   ```

4. **Deployment target**: Docker container with health checks. Include a `docker-compose.yml` with the service + PostgreSQL.

5. **Health endpoint**: `GET /health` returns:
   ```json
   {
     "status": "healthy",
     "registeredVaults": 12,
     "lastRelayedBlock": { "hyper": 1234567, "ethereum": 9876543 },
     "pendingRelays": 0,
     "signers": {
       "bondOracle": "0x...",
       "priceOracle": "0x...",
       "relayer": "0x..."
     }
   }
   ```

6. **Admin endpoints** (authenticated):
   - `GET /api/v1/admin/vaults` — list all registered vaults
   - `GET /api/v1/admin/relays?status=pending` — pending relay queue
   - `POST /api/v1/admin/replay?vault=0x...&fromBlock=N` — force historical replay for a vault

---

## On-Chain Contracts Reference

### VaultFactory.sol — Vault Discovery Event

```solidity
event OptimisticVaultDeployed(
    address indexed vault,
    bytes32 indexed agentId,
    address indexed owner,
    uint256 bondChainId
);
```

### OracleVerifier.sol — Bond Attestation Signing Format

The on-chain verification in `requireValidBondAttestation()` expects:
```
bondHash = keccak256(abi.encodePacked("BOND_LOCK_V1", operator, vault, nonce, amount, chainId))
ethSignedHash = keccak256("\x19Ethereum Signed Message:\n32" || bondHash)
signature = sign(ethSignedHash) → (r, s, v) → packed as r[32] || s[32] || v[1]
```

Types: `operator: address`, `vault: address`, `nonce: uint64`, `amount: uint256`, `chainId: uint256`

**CRITICAL encoding note**: `nonce` is `uint64` in `abi.encodePacked`, which produces 8 bytes (not 32). `operator` and `vault` are `address` (20 bytes). `amount` and `chainId` are `uint256` (32 bytes). The total packed encoding is: `"BOND_LOCK_V1"(12) + operator(20) + vault(20) + nonce(8) + amount(32) + chainId(32) = 124 bytes`.

### OracleVerifier.sol — Price Feed Signing Format

The on-chain verification in `requireValidOracleSignature()` expects:
```
domainFeedHash = keccak256(abi.encodePacked(feedHash, oracleTimestamp, chainId, vaultAddress))
ethSignedHash = keccak256("\x19Ethereum Signed Message:\n32" || domainFeedHash)
signature = sign(ethSignedHash) → (r, s, v) → packed as r[32] || s[32] || v[1]
```

Types: `feedHash: bytes32`, `oracleTimestamp: uint64` (8 bytes packed), `chainId: uint256` (32 bytes), `vaultAddress: address` (20 bytes)

### WSTONBondManager.sol — Relayer Functions

```solidity
function releaseBondByRelayer(address operator, address vault, uint64 nonce) external;
function slashBondByRelayer(address operator, address vault, uint64 nonce, address slasher) external;
// Both require msg.sender == trustedRelayer
```

### OptimisticKernelVault.sol — Events to Monitor (per vault)

```solidity
event ProofSubmitted(uint64 indexed executionNonce, address prover);
event ExecutionSlashed(uint64 indexed executionNonce, address slasher, uint256 bondAmount);
event OptimisticExecutionSubmitted(uint64 indexed executionNonce, bytes32 journalHash, uint256 bondAmount, uint256 deadline);
```

---

## Deployed Contract Addresses

| Contract | Chain | Address |
|----------|-------|---------|
| WSTONBondManager (v2) | Ethereum (1) | `0x46a92cDC8530fd1C4D46891625a718458856Bc14` |
| WSTON Proxy | Ethereum (1) | `0x26C8F112769fb3A3A8de267CfFf60E9f317445e5` |
| VaultFactory (proxy) | HyperEVM (999) | `0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB` |
| VaultFactory | Ethereum (1) | `0x9cF9828Fd6253Df7C9497fd06Fa531E0CCc1d822` |
| OracleVerifier lib | HyperEVM (999) | `0x49D2F7419f15eD00700dE325FE9F945C26353c18` |

---

## Output Format

Provide the complete implementation as production-ready code:

1. **All source files** with full TypeScript code (not pseudocode, not stubs)
2. **package.json** with exact dependencies
3. **Dockerfile** and **docker-compose.yml**
4. **SQL migration files** for the database schema
5. **README.md** with setup instructions, key generation, and deployment steps
6. **Test files** with unit tests for:
   - Signing functions (verify signatures match on-chain `abi.encodePacked` format)
   - Vault registry (mock discovery and dynamic subscription)
   - Relay idempotency (duplicate event rejection)

Ensure the signing logic produces signatures that pass on-chain verification in `OracleVerifier.sol`. Use ethers.js v6 or viem for Ethereum interactions. Use the exact `abi.encodePacked` encoding that Solidity uses — this is critical for signature compatibility. Pay special attention to `uint64` being 8 bytes in `encodePacked` (not 32).
