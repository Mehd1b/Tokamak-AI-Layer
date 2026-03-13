'use client';

import { PROTOCOL_TYPE, type ProtocolType } from '@/lib/protocolTypes';
import { HyperliquidPositionCard } from './HyperliquidPositionCard';
import { PolymarketPositionCard } from './PolymarketPositionCard';

interface ProtocolPositionSectionProps {
  vaultAddress: `0x${string}`;
  protocolType: ProtocolType;
}

/**
 * Renders the protocol-specific position view based on vault type.
 * Generic vaults (type 0) render nothing — only protocol-tagged vaults show positions.
 */
export function ProtocolPositionSection({ vaultAddress, protocolType }: ProtocolPositionSectionProps) {
  switch (protocolType) {
    case PROTOCOL_TYPE.HYPERLIQUID:
      return <HyperliquidPositionCard vaultAddress={vaultAddress} />;
    case PROTOCOL_TYPE.POLYMARKET:
      return <PolymarketPositionCard vaultAddress={vaultAddress} />;
    default:
      return null;
  }
}
