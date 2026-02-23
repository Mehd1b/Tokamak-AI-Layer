'use client';

import { useNetwork } from '@/lib/NetworkContext';

// Ethereum diamond logo
export const EthereumLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 256 417" className={className} fill="none">
    <path d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z" fill="#343434" />
    <path d="M127.962 0L0 212.32l127.962 75.639V154.158z" fill="#8C8C8C" />
    <path d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.601L256 236.587z" fill="#3C3C3B" />
    <path d="M127.962 416.905v-104.72L0 236.585z" fill="#8C8C8C" />
    <path d="M127.961 287.958l127.96-75.637-127.96-58.162z" fill="#141414" />
    <path d="M0 212.32l127.96 75.638v-133.8z" fill="#393939" />
  </svg>
);

// Hyperliquid logo (stylized green mark)
export const HyperliquidLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none">
    <circle cx="50" cy="50" r="48" fill="#0AE87F" />
    <path
      d="M30 65V35h8v12h24V35h8v30h-8V55H38v10z"
      fill="#000"
    />
  </svg>
);

const NETWORKS = [
  { chainId: 11155111, name: 'Sepolia', Logo: EthereumLogo },
  { chainId: 998, name: 'HyperEVM Testnet', Logo: HyperliquidLogo },
];

export function getNetworkInfo(chainId: number) {
  return NETWORKS.find((n) => n.chainId === chainId) ?? NETWORKS[0];
}

/** Small inline badge showing the current network logo + name */
export function NetworkBadge() {
  const { selectedChainId } = useNetwork();
  const network = getNetworkInfo(selectedChainId);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">
      <network.Logo className="w-3 h-3" />
      {network.name}
    </span>
  );
}
