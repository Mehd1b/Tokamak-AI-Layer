export const PointsProgramABI = [
  // ============ State Variables ============
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deployedAt',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'seasonEnd',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalPoints',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'depositPoints',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'executionPoints',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'referralBonusPoints',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'referrers',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },

  // ============ View Functions ============
  {
    type: 'function',
    name: 'getPoints',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMultiplier',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPointsBreakdown',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'deposit_', type: 'uint256' },
      { name: 'execution_', type: 'uint256' },
      { name: 'referral_', type: 'uint256' },
      { name: 'total_', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPendingPoints',
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDailyRate',
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },

  // ============ Public Functions ============
  {
    type: 'function',
    name: 'accruePoints',
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'batchAccrue',
    inputs: [
      { name: 'vaults', type: 'address[]' },
      { name: 'users', type: 'address[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateDepositBalance',
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'user', type: 'address' },
      { name: 'newBalance', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'recordExecution',
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'depositors', type: 'address[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setReferrer',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'referrer', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ============ Owner Functions ============
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setSeasonEnd',
    inputs: [{ name: 'timestamp', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setAuthorizedCaller',
    inputs: [
      { name: 'caller', type: 'address' },
      { name: 'authorized', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ============ Events ============
  {
    type: 'event',
    name: 'PointsAccrued',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'points', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ExecutionBonus',
    inputs: [
      { name: 'vault', type: 'address', indexed: true },
      { name: 'usersRewarded', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ReferralBonus',
    inputs: [
      { name: 'referrer', type: 'address', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'points', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'SeasonEndUpdated',
    inputs: [{ name: 'timestamp', type: 'uint256', indexed: false }],
  },
  {
    type: 'event',
    name: 'DepositBalanceUpdated',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'balance', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ReferrerSet',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'referrer', type: 'address', indexed: true },
    ],
  },

  // ============ Errors ============
  { type: 'error', name: 'NotOwner', inputs: [] },
  {
    type: 'error',
    name: 'InvalidVault',
    inputs: [{ name: 'vault', type: 'address' }],
  },
  { type: 'error', name: 'SeasonEnded', inputs: [] },
  { type: 'error', name: 'InvalidSeasonEnd', inputs: [] },
  { type: 'error', name: 'SelfReferral', inputs: [] },
  { type: 'error', name: 'AlreadyReferred', inputs: [] },
  { type: 'error', name: 'NotAuthorized', inputs: [] },
  { type: 'error', name: 'ArrayLengthMismatch', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
] as const;
