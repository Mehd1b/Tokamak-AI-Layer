export const ReferralManagerABI = [
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
    name: 'referralCodes',
    inputs: [{ name: 'codeHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'referrerCode',
    inputs: [{ name: 'referrer', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'referralPoints',
    inputs: [{ name: 'referrer', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'referredBy',
    inputs: [{ name: 'depositor', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'referralCount',
    inputs: [{ name: 'referrer', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },

  // ============ Owner Functions ============
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ============ Public Functions ============
  {
    type: 'function',
    name: 'registerCode',
    inputs: [{ name: 'code', type: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'recordReferral',
    inputs: [
      { name: 'depositor', type: 'address' },
      { name: 'codeHash', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'decimals', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ============ View Functions ============
  {
    type: 'function',
    name: 'getPoints',
    inputs: [{ name: 'referrer', type: 'address' }],
    outputs: [{ name: 'points', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getReferrer',
    inputs: [{ name: 'depositor', type: 'address' }],
    outputs: [{ name: 'referrer', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'resolveCode',
    inputs: [{ name: 'code', type: 'string' }],
    outputs: [{ name: 'referrer', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getReferrals',
    inputs: [{ name: 'referrer', type: 'address' }],
    outputs: [{ name: 'depositors', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hashCode',
    inputs: [{ name: 'code', type: 'string' }],
    outputs: [{ name: 'codeHash', type: 'bytes32' }],
    stateMutability: 'pure',
  },

  // ============ Events ============
  {
    type: 'event',
    name: 'CodeRegistered',
    inputs: [
      { name: 'referrer', type: 'address', indexed: true },
      { name: 'codeHash', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'ReferralRecorded',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'referrer', type: 'address', indexed: true },
      { name: 'codeHash', type: 'bytes32', indexed: true },
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

  // ============ Errors ============
  { type: 'error', name: 'NotOwner', inputs: [] },
  { type: 'error', name: 'CodeAlreadyTaken', inputs: [] },
  { type: 'error', name: 'AlreadyHasCode', inputs: [] },
  { type: 'error', name: 'EmptyCode', inputs: [] },
  { type: 'error', name: 'InvalidCode', inputs: [] },
  { type: 'error', name: 'SelfReferral', inputs: [] },
  { type: 'error', name: 'AlreadyReferred', inputs: [] },
] as const;
