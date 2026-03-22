export enum ErrorCode {
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  USER_REJECTED = 'USER_REJECTED',
  APPROVAL_FAILED = 'APPROVAL_FAILED',
  DEPOSIT_FAILED = 'DEPOSIT_FAILED',
  WITHDRAW_FAILED = 'WITHDRAW_FAILED',
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  VAULT_NOT_FOUND = 'VAULT_NOT_FOUND',
  STRATEGY_ACTIVE = 'STRATEGY_ACTIVE',
  TRANSACTION_REVERTED = 'TRANSACTION_REVERTED',
}

export class TokamakError extends Error {
  public readonly code: ErrorCode;
  public readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'TokamakError';
    this.code = code;
    this.cause = cause;
  }

  static from(err: unknown): TokamakError {
    if (err instanceof TokamakError) return err;
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes('user rejected') || msg.includes('user denied'))
        return new TokamakError(ErrorCode.USER_REJECTED, 'Transaction rejected by user', err);
      if (msg.includes('insufficient funds') || msg.includes('insufficient balance'))
        return new TokamakError(ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance for transaction', err);
      if (msg.includes('strategyactive'))
        return new TokamakError(ErrorCode.STRATEGY_ACTIVE, 'Vault has an active strategy — deposits are locked until it settles', err);
      return new TokamakError(ErrorCode.TRANSACTION_REVERTED, err.message, err);
    }
    return new TokamakError(ErrorCode.TRANSACTION_REVERTED, String(err), err);
  }
}

export class DepositError extends TokamakError {
  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'DepositError';
  }

  static from(err: unknown): DepositError {
    const base = TokamakError.from(err);
    return new DepositError(base.code, base.message, base.cause);
  }
}

export class WithdrawError extends TokamakError {
  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'WithdrawError';
  }

  static from(err: unknown): WithdrawError {
    const base = TokamakError.from(err);
    return new WithdrawError(base.code, base.message, base.cause);
  }
}
