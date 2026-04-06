# Security Policy

## Known Risks and Assumptions

### ZK Proof Trust Model
- Vault execution relies on RISC Zero ZK proofs to verify agent actions.
- The trusted `imageId` is pinned at vault deployment from the `AgentRegistry` and is immutable for the vault's lifetime.
- If the RISC Zero prover is compromised, proofs could be forged. This is mitigated by the deterministic nature of the guest program and the ability to verify proofs independently.
- Registry updates (new imageId) do NOT affect already-deployed vaults.

### Oracle Trust
- Vaults that use oracle-signed price data trust the configured `oracleSigner`.
- A compromised oracle signer could feed incorrect price data, potentially enabling harmful trades.
- Operators should use well-known, reputable oracle providers and configure `maxOracleAge` to limit stale data.

### Admin Key Management
- Each vault has an immutable `owner` (the agent author) who can execute proven strategies, pause the vault, configure fees, and set oracle parameters.
- The `VaultFactory` owner can upgrade the factory implementation (UUPS proxy), register external vaults, and configure protocol fees.
- Admin keys are single points of failure. See recommendations below.

### Strategy Risk
- When a CALL action sends assets out of the vault (`strategyActive = true`), share price is frozen at a snapshot.
- If the strategy never returns assets, emergency settlement is available after `EMERGENCY_SETTLE_DELAY` (7 days).
- Depositors can emergency-withdraw after the vault is paused for `EMERGENCY_WITHDRAW_DELAY` (14 days).

## Emergency Procedures

### Pause and Emergency Withdraw Flow
1. **Pause**: The vault owner calls `pause()`. This blocks new deposits and normal withdrawals. The `pausedAt` timestamp is recorded.
2. **14-Day Waiting Period**: After the vault has been paused for at least 14 days (`EMERGENCY_WITHDRAW_DELAY`), any depositor can call `emergencyWithdraw()` to reclaim their proportional share of vault assets.
3. **Unpause**: The owner can call `unpause()` to resume normal operations. This resets the emergency withdraw timer.

### Emergency Strategy Settlement
- If a strategy has been active for more than 7 days (`EMERGENCY_SETTLE_DELAY`) without settling, anyone can call `emergencySettleStrategy()` to mark the strategy as settled at the current asset balance, unfreezing share price.

### Incident Response
1. Pause all affected vaults immediately.
2. Assess the scope of the issue.
3. Communicate with depositors through official channels.
4. If the issue requires a contract upgrade, prepare and audit the fix before deploying.
5. After 14 days, depositors can emergency-withdraw if the issue is not resolved.

## Admin Key Management Recommendations

- **Use a Multisig**: Vault owners and the VaultFactory owner should be multisig wallets (e.g., Safe/Gnosis Safe) with a threshold of at least 2-of-3.
- **Hardware Wallets**: All multisig signers should use hardware wallets.
- **Key Rotation**: If a signer key is suspected compromised, immediately rotate the multisig membership.
- **Timelocks**: Consider wrapping admin functions behind a timelock contract for additional safety.
- **Separate Roles**: Use different keys for operational tasks (executing strategies) and administrative tasks (fee changes, pausing).

## Bug Bounty Scope

### In Scope
All Solidity contracts in `contracts/src/`, including:
- `KernelVault.sol` and `OptimisticKernelVault.sol`
- `VaultFactory.sol`
- `AgentRegistry.sol`
- `KernelExecutionVerifier.sol`
- `KernelOutputParser.sol`
- `PointsProgram.sol`
- `ReferralManager.sol`
- All contracts in `contracts/src/extensions/`
- All contracts in `contracts/src/libraries/`
- All contracts in `contracts/src/interfaces/`

### Out of Scope
- Test files (`contracts/test/`)
- Deployment scripts (`contracts/script/`)
- Frontend application code
- Third-party dependencies (OpenZeppelin, forge-std)
- Issues in contracts not deployed to production

### Severity Classification
- **Critical**: Loss of user funds, unauthorized access to vault assets, proof forgery.
- **High**: Permanent denial of service, share price manipulation, fee theft.
- **Medium**: Temporary denial of service, incorrect accounting that does not lead to fund loss.
- **Low**: Gas optimizations, informational findings, best practice deviations.

## Contact

- **Email**: security@tokagent.network
- **Response Time**: We aim to acknowledge reports within 48 hours and provide an initial assessment within 5 business days.

## Responsible Disclosure Policy

1. **Do not** exploit any vulnerability on mainnet or testnet beyond the minimum necessary to demonstrate the issue.
2. **Do not** publicly disclose the vulnerability before it has been fixed and a reasonable time has passed for users to update.
3. **Do** provide a clear description of the vulnerability, including:
   - Affected contract(s) and function(s)
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
4. **Do** give us reasonable time (at least 90 days) to address the issue before public disclosure.
5. We will credit researchers who report valid vulnerabilities (unless they prefer to remain anonymous).
6. We will not take legal action against researchers who follow this policy in good faith.
