// Protocol type constants matching the on-chain VaultFactory._vaultProtocolType mapping
export const PROTOCOL_TYPE = {
  GENERIC: 0,
  HYPERLIQUID: 1,
  POLYMARKET: 2,
} as const;

export type ProtocolType = (typeof PROTOCOL_TYPE)[keyof typeof PROTOCOL_TYPE];

export function protocolLabel(type: ProtocolType): string {
  switch (type) {
    case PROTOCOL_TYPE.HYPERLIQUID:
      return 'Hyperliquid';
    case PROTOCOL_TYPE.POLYMARKET:
      return 'Polymarket';
    default:
      return 'Generic';
  }
}

export function protocolColor(type: ProtocolType): { bg: string; text: string; border: string } {
  switch (type) {
    case PROTOCOL_TYPE.HYPERLIQUID:
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' };
    case PROTOCOL_TYPE.POLYMARKET:
      return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
    default:
      return { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' };
  }
}
