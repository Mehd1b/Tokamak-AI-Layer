# Static Analysis (SLITHER_AVAILABLE=false, grep fallback)

## Reentrancy-Style Patterns (`.call{value:...}`)

| Location | Pattern | Notes |
|----------|---------|-------|
| src/KernelVault.sol:1185 | `(bool success,) = to.call{value: assetsOut}("")` | ETH withdrawal - after state changes |
| src/KernelVault.sol:1305 | `(bool success,) = to.call{value: amount}("")` | ETH rescue - admin function |
| src/KernelVault.sol:1405 | `(bool success, bytes memory returnData) = target.call{value: value}(callData)` | CALL action dispatch - agent-controlled target |
| src/KernelVault.sol:1652 | `(bool success,) = to.call{value: assetsOut}("")` | Second ETH withdrawal path |
| src/adapters/LidoAdapter.sol:376 | `(bool success,) = msg.sender.call{value: ethReceived}("")` | ETH transfer back to vault after claim |
| src/adapters/LidoAdapter.sol:478 | `(bool ok,) = to.call{value: amount}("")` | Emergency withdraw ETH |
| src/adapters/HyperliquidAdapter.sol:284 | `(bool success,) = config.subAccount.call{value: msg.value}("")` | Forward ETH to TradingSubAccount |
| src/adapters/TradingSubAccount.sol:175 | `(bool success,) = HYPE_SYSTEM_ADDRESS.call{value: balance}("")` | Bridge HYPE to CoreWriter |
| src/MockYieldSource.sol:70 | `(bool success,) = vault.call{value: totalAmount}("")` | Mock only - not audit scope |

## KEY RISK: KernelVault action dispatch (L1405)
The line `target.call{value: value}(callData)` dispatches arbitrary agent-specified CALL actions.
- target and callData are derived from agent output — cryptographically committed via ZK proof
- This is by design: the agent has full control within constraints enforced inside zkVM
- Re-entrancy risk is bounded by nonReentrant guard on execute()
- However: each action is dispatched sequentially in a loop (up to 64 actions)

## Division Patterns (potential div-before-mul)
No obvious division-before-multiplication patterns found via basic grep.
Note: Solidity 0.8.24 has no native SafeMath requirement (overflow reverts by default).
No `unchecked {}` blocks found in main contracts.

## Loops with External State/Calls
| Location | Pattern | Risk |
|----------|---------|------|
| src/AgentRegistry.sol:301 | `for i in vaults → IKernelVaultView(vaults[i]).totalAssets()` | External call in loop during unregister |
| src/AgentRegistry.sol:398 | `for i in maxDepth → _successors[current]` | Storage read loop, depth 64 cap |
| src/adapters/LidoAdapter.sol:312 | `for i in amounts.length → requestWithdrawals` | External call in loop |
| src/adapters/LidoAdapter.sol:336 | `for i in requestIds.length → external Lido call` | External call in loop |
| src/adapters/LidoAdapter.sol:351 | `for i in requestIds.length → claimWithdrawals` | External call in loop |
| src/BuilderProgram.sol:340-358 | `for i in total → reads builders[...]` | Storage reads, no external calls |
| src/PointsProgram.sol:327 | `for i in vaults.length → reads vault balances` | External view calls in loop |
| src/PointsProgram.sol:379 | `for i in depositors.length → external state read` | Loop gas risk |

## Action Dispatch Loop (KernelVault)
- Up to 64 actions dispatched per execution (MAX_ACTIONS_PER_OUTPUT = 64)
- Each action is a `target.call{value}(callData)` — arbitrary external call
- `maxDelta` per-action cap: 40% of `balanceBefore` (live balance, not initial)
- Compounding: 40% each action → 64 actions → ~99.99% drain possible (confirmed by test_H3 PoC)

## Unchecked Arithmetic
- No `unchecked {}` blocks found in main contracts
- Solidity 0.8.24 auto-reverts on overflow

## Compiler Warnings (not slither, from forge build)
- HyperliquidAdapter:245 `closePosition()` — state mutability can be restricted to pure
- HyperliquidAdapter:312 `closePositionAdmin()` — state mutability can be restricted to pure

## Additional Patterns of Note
- UUPS proxy pattern: AgentRegistry, VaultFactory, KernelExecutionVerifier use UUPS with 48h upgrade delay
- Two-step ownership: all major contracts use pendingOwner pattern
- KernelVault: non-upgradeable by design
- Bond attestation uses ECDSA (OracleVerifier library) — replay protection via chain ID + vault + nonce + timestamp
