/**
 * Strip API keys and sensitive tokens from URLs in error messages.
 * Matches patterns like /v2/KEY, /v3/KEY, ?apikey=KEY, &api_key=KEY, etc.
 */
export function sanitizeErrorMessage(msg: string): string {
  return msg
    // Strip path-based API keys: /v2/abc123... or /v3/abc123...
    .replace(/\/v\d+\/[A-Za-z0-9_-]{10,}/g, '/v*/***')
    // Strip query param keys: ?apikey=... or &api_key=... or &key=...
    .replace(/([?&])(api[_-]?key|key|token|secret|auth)=[^&\s]*/gi, '$1$2=***')
    // Strip full URLs to just host + path hint
    .replace(/https?:\/\/[^\s"')]+/g, (url) => {
      try {
        const u = new URL(url);
        return `${u.protocol}//${u.hostname}/...`;
      } catch {
        return '[URL redacted]';
      }
    });
}

/**
 * Human-readable error messages for KernelVault custom errors.
 * Keys are Solidity error names as they appear in revert reason strings.
 */
const VAULT_ERROR_MAP: Record<string, string> = {
  DepositsLockedDuringStrategy: 'Deposits are locked while a strategy is active.',
  WrongDepositFunction: 'Wrong deposit function for this vault type.',
  ZeroDeposit: 'Deposit amount must be greater than zero.',
  ZeroAssets: 'Vault has zero assets — deposits are temporarily blocked.',
  ZeroShares: 'Deposit too small — would mint zero shares.',
  TransferFailed: 'Token transfer failed. Check your balance and allowance.',
  InsufficientShares: 'You don\'t have enough shares to withdraw that amount.',
  ZeroWithdraw: 'Withdraw amount must be greater than zero.',
  ZeroAssetsOut: 'Withdraw would return zero assets.',
  InsufficientAvailableAssets: 'Not enough available assets in the vault to withdraw.',
  ETHDepositMismatch: 'ETH sent does not match expected deposit amount.',
  ETHTransferFailed: 'ETH transfer failed.',
  StrategyNotActive: 'No active strategy to settle.',
  NotOwner: 'Only the vault owner can perform this action.',
  AgentIdMismatch: 'Agent ID does not match this vault.',
  InvalidNonce: 'Execution nonce is invalid.',
  NonceGapTooLarge: 'Execution nonce gap is too large.',
  ActionCommitmentMismatch: 'Action commitment does not match proof.',
  InvalidTrustedImageId: 'Invalid trusted image ID.',
};

/**
 * Parse a wagmi/viem error into a human-readable message.
 * Checks for known KernelVault custom error names in the error string.
 */
export function parseVaultError(error: Error | null | undefined): string | null {
  if (!error) return null;

  const msg = error.message ?? String(error);

  // Check for known custom error names
  for (const [errorName, humanMessage] of Object.entries(VAULT_ERROR_MAP)) {
    if (msg.includes(errorName)) {
      return humanMessage;
    }
  }

  // Common RPC / wallet errors
  if (msg.includes('User rejected') || msg.includes('user rejected')) {
    return 'Transaction rejected by user.';
  }
  if (msg.includes('insufficient funds') || msg.includes('InsufficientFunds')) {
    return 'Insufficient funds for this transaction.';
  }
  if (msg.includes('Internal JSON-RPC error') || msg.includes('-32603')) {
    return 'Transaction reverted during gas estimation. Check that your wallet is on the correct network and that the token supports this operation.';
  }
  if (msg.includes('gas limit') || msg.includes('exceeds block gas limit')) {
    return 'Transaction reverted. The vault may be in an invalid state or inputs are incorrect.';
  }
  if (msg.includes('nonce too low') || msg.includes('nonce has already been used')) {
    return 'Transaction nonce conflict. Please try again.';
  }

  // Rate limiting
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('Too Many Requests')) {
    return 'RPC rate limit reached. Please try again in a few seconds.';
  }

  // Fallback: sanitize and truncate the raw message
  const clean = sanitizeErrorMessage(msg.replace(/^.*reason:\s*/i, '').split('\n')[0]);
  return clean.length > 120 ? clean.slice(0, 120) + '...' : clean;
}
