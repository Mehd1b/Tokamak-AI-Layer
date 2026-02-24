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
  if (msg.includes('gas limit') || msg.includes('exceeds block gas limit')) {
    return 'Transaction reverted. The vault may be in an invalid state or inputs are incorrect.';
  }
  if (msg.includes('nonce too low') || msg.includes('nonce has already been used')) {
    return 'Transaction nonce conflict. Please try again.';
  }

  // Fallback: truncate the raw message
  const clean = msg.replace(/^.*reason:\s*/i, '').split('\n')[0];
  return clean.length > 120 ? clean.slice(0, 120) + '...' : clean;
}
