# Agent Discovery Feed + `tal fork` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent metadata (name, description, tags, source repo) to the registry, a `tal fork` CLI command for cloning agents, and an enhanced frontend agent discovery page — creating a viral discover-fork-deploy loop.

**Architecture:** On-chain `agentMetadataURI` mapping in AgentRegistry stores a URI pointing to off-chain JSON metadata. `tal fork` fetches metadata, clones the source repo, and scaffolds a modified agent. Frontend displays agent cards with rich metadata, vault count, and TVL.

**Tech Stack:** Solidity (AgentRegistry), Rust (tal-cli), TypeScript (SDK + frontend)

---

### Task 1: Add agentMetadataURI to AgentRegistry contract

**Files:**
- Modify: `contracts/src/AgentRegistry.sol`
- Modify: `contracts/src/interfaces/IAgentRegistry.sol`

In AgentRegistry.sol, add before the `__gap` (line 48):
```solidity
mapping(bytes32 => string) internal _agentMetadataURI;
```

Reduce `__gap` from `uint256[44]` to `uint256[43]` to account for the new storage slot.

Add event to IAgentRegistry.sol:
```solidity
event AgentMetadataUpdated(bytes32 indexed agentId, string metadataURI);
```

Add two functions to AgentRegistry.sol (before end of contract):
```solidity
function setMetadataURI(bytes32 agentId, string calldata uri) external {
    require(_agents[agentId].exists, "AgentDoesNotExist");
    require(_agents[agentId].author == msg.sender, "NotAgentAuthor");
    _agentMetadataURI[agentId] = uri;
    emit AgentMetadataUpdated(agentId, uri);
}

function getMetadataURI(bytes32 agentId) external view returns (string memory) {
    return _agentMetadataURI[agentId];
}
```

Verify: `cd contracts && forge build && forge test`

---

### Task 2: Add metadata methods to SDK

**Files:**
- Modify: `sdk/src/abi/AgentRegistry.ts`
- Modify: `sdk/src/clients/AgentRegistryClient.ts`

Add ABI entries for setMetadataURI, getMetadataURI, and AgentMetadataUpdated event.

Add client methods:
```typescript
async getMetadataURI(agentId: `0x${string}`): Promise<string>
async setMetadataURI(agentId: `0x${string}`, uri: string): Promise<`0x${string}`>
```

Verify: `cd sdk && npm run build && npm run typecheck`

---

### Task 3: Add `tal fork` CLI subcommand

**Files:**
- Create: `crates/tal-cli/src/fork.rs`
- Modify: `crates/tal-cli/src/main.rs`

Add `Fork` variant to Commands enum with `agent_id: String` and optional `--name`, `--output` args.

fork.rs flow:
1. Resolve RPC URL from .env or default (HyperEVM 999)
2. Query AgentRegistry.getMetadataURI(agentId) on-chain
3. If URI exists, fetch JSON metadata (reqwest GET)
4. If metadata has sourceRepo, clone it (git clone --depth 1)
5. If no sourceRepo, scaffold from `tal init --template minimal`
6. Generate new salt
7. Update Cargo.toml with new agent name
8. Print next steps (tal sim, tal build, tal deploy)

Verify: `cargo check -p tal-cli`

---

### Task 4: Enhance frontend agent display

**Files:**
- Modify: `frontend/src/app/vaults/page.tsx` (or create agents route if missing)
- Create: `frontend/src/hooks/useAgentMetadata.ts`

Add hook that fetches metadata URI from registry then fetches JSON:
```typescript
export function useAgentMetadata(agentId: `0x${string}` | undefined)
```

On vault cards, show agent name (from metadata) instead of truncated agentId when available.

Verify: `cd frontend && npm run build`

---

### Task 5: Build verification

Full workspace check, SDK build+tests, frontend build.
