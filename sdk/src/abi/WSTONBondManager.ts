export const WSTONBondManagerABI = [
  {
    type: 'function',
    name: 'bondToken',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBondedAmount',
    inputs: [{ name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMinBond',
    inputs: [{ name: 'vault', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
