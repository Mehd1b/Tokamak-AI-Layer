# TEE Attested & Hybrid Validation — Implementation Guide

## Status

| Component | Status |
|-----------|--------|
| On-chain verification (`TALValidationRegistry`) | **COMPLETE** |
| TEE provider management (whitelist, enclave hashes) | **COMPLETE** |
| Bounty distribution | **COMPLETE** |
| Test suite (20 integration tests) | **COMPLETE** |
| Agent execution in TEE environments | **NOT IMPLEMENTED** |
| Attestation proof generation | **NOT IMPLEMENTED** |
| Agent runtime TEE integration | **NOT IMPLEMENTED** |
| Frontend validation request (model 2/3) | **Blocked** ("Coming Soon") |
| Frontend proof submission UI | **NOT IMPLEMENTED** |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WHAT EXISTS TODAY                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Requester ──► TALValidationRegistry.requestValidation(model=2)    │
│                      │                                              │
│                      ▼                                              │
│               Request stored on-chain (bounty escrowed)            │
│                      │                                              │
│                      ▼                                              │
│  TEE Provider ──► TALValidationRegistry.submitValidation(proof)    │
│                      │                                              │
│                      ▼                                              │
│              _verifyTEEAttestation(proof, requestHash)             │
│              ├── Check provider whitelisted                         │
│              ├── Check enclave hash matches                         │
│              ├── Check timestamp freshness (< 1 hour)              │
│              └── Verify ECDSA signature via ecrecover              │
│                      │                                              │
│                      ▼                                              │
│              _distributeBounty()                                    │
│              ├── 10% → Treasury                                     │
│              ├── 9%  → Agent Owner                                  │
│              └── 81% → Validator (TEE Provider)                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      WHAT NEEDS TO BE BUILT                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. TEE Execution Environment (SGX / Nitro / TrustZone)            │
│     └── Runs agent code inside hardware enclave                     │
│                                                                     │
│  2. Attestation Generator                                           │
│     └── Produces signed proof: (enclaveHash, signer, ts, sig)      │
│                                                                     │
│  3. Agent Runtime Integration                                       │
│     └── Routes TEE model agents to enclave execution               │
│                                                                     │
│  4. TEE Provider Service                                            │
│     └── Watches for pending TEE requests, executes, submits proof  │
│                                                                     │
│  5. Frontend                                                        │
│     └── Remove "Coming Soon", add proof submission UI              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: On-Chain Contract Reference

### 1.1 Proof Encoding Format

The `_verifyTEEAttestation` function expects the `proof` parameter encoded as:

```solidity
bytes memory proof = abi.encode(
    bytes32 enclaveHash,    // Code measurement of the TEE enclave
    address teeSigner,      // Whitelisted TEE provider address
    uint256 timestamp,      // Unix timestamp (must be < 1 hour old)
    bytes memory signature  // 65-byte ECDSA signature (r ++ s ++ v)
);
```

### 1.2 Signature Construction

The signature must cover this exact message:

```solidity
bytes32 messageHash = keccak256(abi.encodePacked(
    enclaveHash,            // bytes32
    request.taskHash,       // bytes32 — from the on-chain request
    request.outputHash,     // bytes32 — from the on-chain request
    requestHash,            // bytes32 — the validation request ID
    timestamp               // uint256
));

bytes32 ethSignedHash = keccak256(abi.encodePacked(
    "\x19Ethereum Signed Message:\n32",
    messageHash
));

// Sign ethSignedHash with the TEE provider's private key
// Result: 65 bytes = r (32) + s (32) + v (1)
```

### 1.3 Verification Checks (in order)

The contract performs these checks in `_verifyTEEAttestation`:

1. **Proof length**: `proof.length >= 128` (minimum valid ABI-encoded size)
2. **Provider whitelisted**: `trustedTEEProviders[teeSigner] == true`
3. **Enclave hash match**: `teeEnclaveHashes[teeSigner] == enclaveHash`
4. **Freshness**: `block.timestamp - timestamp <= 1 hours`
5. **Signature validity**: `ecrecover(ethSignedHash, v, r, s) == teeSigner`

Any failure reverts with `InvalidTEEAttestation()` or `TEEProviderNotTrusted(teeSigner)`.

### 1.4 Admin Setup Required

Before TEE validation can work, a `TEE_MANAGER_ROLE` holder must:

```solidity
// 1. Whitelist the TEE provider address
validationRegistry.setTrustedTEEProvider(providerAddress);

// 2. Register the enclave hash for that provider
validationRegistry.setTEEEnclaveHash(providerAddress, enclaveHash);
```

### 1.5 Hybrid Model Differences

Hybrid (model 3) requires everything TEE Attested requires, PLUS:

- A validator must be selected first via DRB (`selectValidator()`)
- The submitter must be the selected validator
- The validator must have sufficient L1 stake (verified via staking bridge)
- The same TEE proof is required

```
Hybrid = StakeSecured validator selection + TEE attestation proof
```

### 1.6 Bounty Requirements

| Model | Minimum Bounty | Default |
|-------|---------------|---------|
| ReputationOnly (0) | 0 TON | 0 |
| StakeSecured (1) | `minStakeSecuredBounty` | 10 TON |
| TEEAttested (2) | `minTEEBounty` | 1 TON |
| Hybrid (3) | `max(minStakeSecured, minTEE)` | 10 TON |

---

## Part 2: Implementation Tasks

### Task 1: TEE Provider Service

**Purpose**: A backend service that watches for pending TEE validation requests and fulfills them.

**Location**: `agent-examples/solidity-auditor/src/services/tee-provider.ts` (new file)

**Responsibilities**:
1. Watch `ValidationRequested` events where `model == TEEAttested`
2. For each pending request:
   a. Retrieve the agent's task and output from IPFS/on-chain
   b. Re-execute the task inside a TEE environment
   c. Compare output hashes
   d. Construct a TEE attestation proof
   e. Submit the validation on-chain

**Pseudocode**:

```typescript
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';

const TEE_PROVIDER_KEY = process.env.TEE_PROVIDER_PRIVATE_KEY;
const ENCLAVE_HASH = process.env.TEE_ENCLAVE_HASH; // bytes32

async function watchForTEERequests() {
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  // Watch for new TEE validation requests
  client.watchContractEvent({
    address: VALIDATION_REGISTRY_ADDRESS,
    abi: ValidationRegistryABI,
    eventName: 'ValidationRequested',
    onLogs: async (logs) => {
      for (const log of logs) {
        const { requestHash, agentId, model } = log.args;
        if (model !== 2) continue; // Only TEE Attested

        await handleTEEValidation(requestHash, agentId);
      }
    },
  });
}

async function handleTEEValidation(requestHash: Hex, agentId: bigint) {
  // 1. Get the request details from chain
  const [request] = await client.readContract({
    address: VALIDATION_REGISTRY_ADDRESS,
    abi: ValidationRegistryABI,
    functionName: 'getValidation',
    args: [requestHash],
  });

  // 2. Re-execute the task in TEE (see Task 2)
  const { score, reExecutionHash } = await executeInTEE(
    agentId,
    request.taskHash,
    request.outputHash
  );

  // 3. Construct TEE proof
  const proof = constructTEEProof(requestHash, request);

  // 4. Submit validation on-chain
  await walletClient.writeContract({
    address: VALIDATION_REGISTRY_ADDRESS,
    abi: ValidationRegistryABI,
    functionName: 'submitValidation',
    args: [requestHash, score, proof, detailsURI],
  });
}

function constructTEEProof(
  requestHash: Hex,
  request: { taskHash: Hex; outputHash: Hex }
): Hex {
  const timestamp = BigInt(Math.floor(Date.now() / 1000));

  // Build the message hash matching the contract's verification
  const messageHash = keccak256(
    encodePacked(
      ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint256'],
      [ENCLAVE_HASH, request.taskHash, request.outputHash, requestHash, timestamp]
    )
  );

  const ethSignedHash = keccak256(
    encodePacked(
      ['string', 'bytes32'],
      ['\x19Ethereum Signed Message:\n32', messageHash]
    )
  );

  // Sign with TEE provider key
  const signature = await account.signMessage({ raw: ethSignedHash });

  // ABI encode the proof
  return encodeAbiParameters(
    [
      { type: 'bytes32' },  // enclaveHash
      { type: 'address' },  // teeSigner
      { type: 'uint256' },  // timestamp
      { type: 'bytes' },    // signature
    ],
    [ENCLAVE_HASH, account.address, timestamp, signature]
  );
}
```

### Task 2: TEE Execution Environment

**Purpose**: Actually run agent code inside a hardware-attested environment.

**Options** (pick one):

#### Option A: AWS Nitro Enclaves (Recommended for MVP)

- Deploy agent runtime inside a Nitro Enclave
- Use `aws-nitro-enclaves-sdk` to generate attestation documents
- Derive a TEE signing key from the enclave's identity
- Sign validation proofs with this key

```
EC2 Instance
└── Nitro Enclave
    ├── Agent Runtime (Node.js)
    ├── TEE Key (derived from enclave identity)
    └── Attestation Generator
        └── Signs: (enclaveHash, taskHash, outputHash, requestHash, timestamp)
```

**Key steps**:
1. Build enclave image (EIF) containing the agent runtime
2. The `enclaveHash` = PCR0 measurement of the EIF
3. Derive an ECDSA key inside the enclave (deterministic from PCR values)
4. Register the derived address and PCR0 hash on-chain

#### Option B: Intel SGX

- Use Gramine or Occlum to run Node.js in an SGX enclave
- Use SGX DCAP attestation for remote attestation
- Derive signing key from MRENCLAVE

#### Option C: Simulated TEE (Development Only)

For development/testnet, simulate TEE with a dedicated signer:

```typescript
// dev-tee-provider.ts — FOR TESTNET ONLY
import { privateKeyToAccount } from 'viem/accounts';

const TEE_SIGNER = privateKeyToAccount(process.env.DEV_TEE_PRIVATE_KEY);
const ENCLAVE_HASH = '0x' + '0'.repeat(62) + 'ff'; // Fake enclave hash

// Admin must whitelist this address:
// validationRegistry.setTrustedTEEProvider(TEE_SIGNER.address)
// validationRegistry.setTEEEnclaveHash(TEE_SIGNER.address, ENCLAVE_HASH)
```

### Task 3: Agent Runtime Integration

**File**: `agent-examples/solidity-auditor/src/services/validation.ts`

**Changes needed**:

```typescript
// Add to submitValidationOnChain or create new function
export async function submitTEEValidation(
  requestHash: Hex,
  score: number,
  detailsURI: string,
  teeConfig: {
    enclaveHash: Hex;
    signerAccount: Account;
  }
): Promise<{ txHash: string }> {
  // 1. Read the request from chain to get taskHash and outputHash
  const [request] = await publicClient.readContract({
    address: CONTRACTS.validationRegistry,
    abi: ValidationRegistryABI,
    functionName: 'getValidation',
    args: [requestHash],
  });

  // 2. Construct the TEE proof
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const proof = await constructTEEProof(
    teeConfig.enclaveHash,
    teeConfig.signerAccount,
    request.taskHash,
    request.outputHash,
    requestHash,
    timestamp
  );

  // 3. Submit on-chain
  const hash = await walletClient.writeContract({
    address: CONTRACTS.validationRegistry,
    abi: ValidationRegistryABI,
    functionName: 'submitValidation',
    args: [requestHash, score, proof, detailsURI],
  });

  return { txHash: hash };
}
```

### Task 4: SDK Integration

**File**: `sdk/src/validation/ValidationClient.ts`

Add a method to construct and submit TEE validation proofs:

```typescript
async submitTEEValidation(params: {
  requestHash: Hex;
  score: number;
  enclaveHash: Hex;
  detailsURI: string;
}): Promise<Hex> {
  // The SDK should construct the proof and submit
  // This requires a wallet client with the TEE provider's key
}
```

### Task 5: Frontend Changes

**Files to modify when TEE is ready**:

1. **`frontend/src/app/validation/request/page.tsx`**
   - Remove the `comingSoon` guard (lines 209, 215-216, 226-227, 235-239)
   - The contract already accepts model 2 and 3 requests

2. **`frontend/src/app/validation/[hash]/page.tsx`**
   - For TEE Attested pending validations, show:
     - "Awaiting TEE Provider" instead of "Awaiting Validator"
     - TEE provider requirements info
   - For completed TEE validations, show:
     - TEE provider address
     - Enclave hash used
     - Attestation timestamp

3. **New hook: `frontend/src/hooks/useTEEProviders.ts`**
   - Read `getTrustedTEEProviders()` from the contract
   - Display trusted provider list on the validation detail page

---

## Part 3: Hybrid Model Implementation

Hybrid (model 3) = StakeSecured + TEEAttested. Both must be satisfied:

### Additional Requirements Beyond TEE

1. **DRB Validator Selection**: Before submitting, `selectValidator(requestHash)` must be called via the DRB integration module (commit-reveal2 protocol)
2. **Stake Verification**: The selected validator must have sufficient L1 stake, verified via `TALStakingBridgeL2.isVerifiedOperator(validator)`
3. **Identity Match**: The submitter (`msg.sender`) must be the DRB-selected validator

### Flow

```
1. Requester calls requestValidation(model=3, bounty >= 10 TON)
2. DRB module calls selectValidator(requestHash)
   └── Commit-reveal2 random selection from staked operators
3. Selected validator executes task in TEE environment
4. Validator constructs TEE proof (same format as model 2)
5. Validator calls submitValidation(requestHash, score, teeProof, uri)
   └── Contract checks:
       a. msg.sender == selectedValidator
       b. isVerifiedOperator(msg.sender) == true (L1 stake)
       c. _verifyTEEAttestation(proof) passes
6. Bounty distributed
```

### What Needs to Exist for Hybrid

Everything from TEE Attested, PLUS:
- DRB integration module must be deployed and configured
- Staking bridge must be deployed and syncing L1 stake data
- Validators must have both: L1 stake AND TEE execution capability

---

## Part 4: Testing Reference

### Running Existing TEE Tests

```bash
cd contracts
forge test --match-path test/integration/TEEAttestedValidation.t.sol -vvv
```

All 20 tests should pass. They cover:
- Bounty requirements (min 1 TON)
- Provider management (add, remove, duplicates)
- Complete validation flow with real ECDSA signatures
- Proof validation (rejects empty/invalid proofs)
- Bounty distribution (81/9/10 split)
- Deadline enforcement
- Untrusted provider rejection
- Stale attestation rejection (> 1 hour)

### Test Helper for Constructing Proofs

See `TEEAttestedValidation.t.sol:_createTEEProofWithSignature()` — this is the reference implementation for constructing valid TEE proofs. Any off-chain implementation must produce identical encoding.

---

## Part 5: Deployment Checklist

When TEE infrastructure is ready:

### On-Chain (Admin Actions)

- [ ] Generate TEE provider keypair (inside enclave or for dev)
- [ ] Call `validationRegistry.setTrustedTEEProvider(providerAddress)` (requires `TEE_MANAGER_ROLE`)
- [ ] Build TEE enclave image and compute `enclaveHash` (PCR0 / MRENCLAVE)
- [ ] Call `validationRegistry.setTEEEnclaveHash(providerAddress, enclaveHash)` (requires `TEE_MANAGER_ROLE`)
- [ ] Optionally adjust `minTEEBounty` via `updateValidationParameters()`

### Backend

- [ ] Deploy TEE provider service (watches events, executes in enclave, submits proofs)
- [ ] Configure `TEE_PROVIDER_PRIVATE_KEY` environment variable
- [ ] Configure `TEE_ENCLAVE_HASH` environment variable
- [ ] Configure RPC endpoint and contract addresses

### Frontend

- [ ] Remove `comingSoon` guard in `validation/request/page.tsx`
- [ ] Add TEE provider info display on validation detail page
- [ ] Add enclave hash and attestation details to completed TEE validations

### For Hybrid Model (Additional)

- [ ] Deploy and configure `DRBIntegrationModule` with commit-reveal2
- [ ] Ensure `TALStakingBridgeL2` is syncing L1 stake data
- [ ] TEE provider must also be a staked operator on L1
- [ ] Remove `comingSoon` guard for model 3 in frontend

---

## Part 6: Key Contract References

| File | Relevant Code |
|------|--------------|
| `contracts/src/core/TALValidationRegistry.sol` | `_verifyTEEAttestation()` (line ~927), `submitValidation()` TEE branch (line ~326), `setTrustedTEEProvider()` (line ~536), `setTEEEnclaveHash()` (line ~844) |
| `contracts/src/interfaces/ITEEAttestation.sol` | `Attestation` struct, `TEEType` enum |
| `contracts/src/interfaces/IERC8004ValidationRegistry.sol` | `ValidationModel` enum (line ~23) |
| `contracts/test/integration/TEEAttestedValidation.t.sol` | `_createTEEProofWithSignature()` (line ~504) — reference proof construction |
| `contracts/test/mocks/MockTEEProvider.sol` | Mock for testing (not used by registry) |
| `sdk/src/abi/TALIdentityRegistryV2.ts` | V2 ABI with `canReactivate`, `reactivate` |
| `frontend/src/app/validation/request/page.tsx` | "Coming Soon" guard (line ~209) |
