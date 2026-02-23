'use client';

import { useState, useRef, useEffect } from 'react';
import { useSwitchChain } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';
import { EthereumLogo, HyperliquidLogo } from '@/components/NetworkLogo';

const NETWORKS = [
  { chainId: 11155111, name: 'Sepolia', Logo: EthereumLogo },
  { chainId: 998, name: 'HyperEVM Testnet', Logo: HyperliquidLogo },
];

export function NetworkSelector() {
  const { selectedChainId, setSelectedChainId } = useNetwork();
  const { switchChain } = useSwitchChain();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = NETWORKS.find((n) => n.chainId === selectedChainId) ?? NETWORKS[0];

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/30 text-white hover:border-white/60 transition-all text-sm tracking-wider"
        style={{ fontFamily: 'var(--font-mono), monospace' }}
      >
        <current.Logo className="w-4 h-4" />
        {current.name}
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute top-full mt-2 right-0 w-48 p-2 rounded-xl border border-[#A855F7]/30 backdrop-blur-md bg-[#0a0a0f]/90 z-50"
        >
          {NETWORKS.map((network) => (
            <button
              key={network.chainId}
              onClick={() => {
                setSelectedChainId(network.chainId);
                switchChain({ chainId: network.chainId });
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                network.chainId === selectedChainId
                  ? 'bg-[#A855F7]/10 text-[#A855F7]'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              <network.Logo className="w-4 h-4" />
              {network.name}
              {network.chainId === selectedChainId && (
                <svg className="w-3.5 h-3.5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
