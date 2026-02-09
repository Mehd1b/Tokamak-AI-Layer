'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function ConnectWalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none' as const,
                userSelect: 'none' as const,
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="group relative overflow-hidden rounded-full px-5 py-2.5 text-sm font-medium text-[#38BDF8] transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.3)]"
                    style={{
                      fontFamily: 'var(--font-mono), monospace',
                      background: 'linear-gradient(#0a0a0f, #0a0a0f) padding-box, linear-gradient(135deg, #38BDF8, #0ea5e9, transparent, #38BDF8) border-box',
                      border: '1px solid transparent',
                    }}
                  >
                    {/* Inner grid pattern */}
                    <div
                      className="absolute inset-[1px] rounded-full opacity-40 pointer-events-none"
                      style={{
                        backgroundImage:
                          'linear-gradient(to right, rgba(56,189,248,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.1) 1px, transparent 1px)',
                        backgroundSize: '6px 6px',
                        maskImage: 'radial-gradient(ellipse 80% 80% at center, black 20%, transparent 70%)',
                        WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at center, black 20%, transparent 70%)',
                      }}
                    />
                    <span className="relative z-10 flex items-center gap-2 tracking-wider">
                      {/* Wallet SVG icon */}
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
                      </svg>
                      CONNECT
                    </span>
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="rounded-full px-4 py-2 text-sm font-medium border border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all duration-300 tracking-wider"
                    style={{ fontFamily: 'var(--font-mono), monospace' }}
                  >
                    WRONG NETWORK
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  {/* Chain button */}
                  <button
                    onClick={openChainModal}
                    className="group flex items-center gap-1.5 rounded-full px-3 py-2 text-xs border border-white/10 bg-white/5 hover:border-[#38BDF8]/30 hover:bg-[#38BDF8]/5 transition-all duration-300"
                    style={{ fontFamily: 'var(--font-mono), monospace' }}
                  >
                    {chain.hasIcon && chain.iconUrl && (
                      <img
                        alt={chain.name ?? 'Chain'}
                        src={chain.iconUrl}
                        className="w-4 h-4 rounded-full"
                      />
                    )}
                    <span className="text-zinc-400 group-hover:text-[#38BDF8] transition-colors hidden sm:inline">
                      {chain.name}
                    </span>
                  </button>

                  {/* Account button */}
                  <button
                    onClick={openAccountModal}
                    className="group relative overflow-hidden flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 hover:shadow-[0_0_15px_rgba(56,189,248,0.2)]"
                    style={{
                      fontFamily: 'var(--font-mono), monospace',
                      background: 'linear-gradient(#0a0a0f, #0a0a0f) padding-box, linear-gradient(135deg, #38BDF8/40, transparent, #38BDF8/40) border-box',
                      border: '1px solid rgba(56,189,248,0.3)',
                    }}
                  >
                    {/* Subtle pulse dot */}
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38BDF8] opacity-40" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#38BDF8]" />
                    </span>
                    <span className="text-white tracking-wider">
                      {account.displayName}
                    </span>
                    {account.displayBalance && (
                      <span className="text-zinc-500 text-xs hidden sm:inline">
                        {account.displayBalance}
                      </span>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
