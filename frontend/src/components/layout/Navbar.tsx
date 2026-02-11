'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { clsx } from 'clsx';
import { useState, useEffect } from 'react';

// Use the custom wallet button throughout
const ConnectButton = ConnectWalletButton;

const navLinks = [
  { href: '/agents', label: 'AGENTS' },
  { href: '/validation', label: 'VALIDATION' },
  { href: '/staking', label: 'STAKING' },
  { href: 'https://tokamak-ai-layer.vercel.app/', label: 'DOCS', external: true },
];

export function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isMenuOpen]);

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-6 sm:px-8">
        {/* Logo - Radar Style */}
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative w-10 h-10">
            <svg viewBox="0 0 40 40" className="w-full h-full">
              <circle
                cx="20" cy="20" r="16"
                fill="none" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.3"
                strokeDasharray="4 4"
                className="group-hover:stroke-opacity-60 transition-all duration-300"
              />
              <circle
                cx="20" cy="20" r="10"
                fill="none" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.5"
                className="group-hover:stroke-opacity-80 transition-all duration-300"
              />
              <circle
                cx="20" cy="20" r="3"
                fill="#38BDF8"
                className="group-hover:filter group-hover:drop-shadow-[0_0_6px_#38BDF8] transition-all duration-300"
              />
            </svg>
          </div>
          <span
            className="text-lg font-medium tracking-wider text-white group-hover:text-[#38BDF8] transition-colors duration-300"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            TAL
          </span>
        </Link>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg border border-dashed transition-all tracking-wider text-sm border-white/30 text-white hover:border-white/60 hover:text-gray-300"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'px-4 py-2 rounded-lg border border-dashed transition-all tracking-wider text-sm',
                  pathname?.startsWith(link.href)
                    ? 'border-[#38BDF8]/60 text-[#38BDF8]'
                    : 'border-white/30 text-white hover:border-white/60 hover:text-gray-300',
                )}
              >
                {link.label}
              </Link>
            )
          )}
          <div className="ml-4">
            <ConnectButton />
          </div>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-3 md:hidden">
          <ConnectButton />
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="relative group p-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm hover:border-[#38BDF8]/50 transition-all duration-300"
            aria-label="Toggle menu"
          >
            <div className="w-6 h-6 flex flex-col justify-center items-center">
              <span className={`block w-5 h-0.5 bg-current transform transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-1' : ''} group-hover:bg-[#38BDF8]`} />
              <span className={`block w-5 h-0.5 bg-current mt-1 transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''} group-hover:bg-[#38BDF8]`} />
              <span className={`block w-5 h-0.5 bg-current mt-1 transform transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-1' : ''} group-hover:bg-[#38BDF8]`} />
            </div>
          </button>
        </div>
      </nav>

      {/* Full-Screen Mobile Menu */}
      {isMenuOpen && (
        <div className="fixed top-0 left-0 w-full h-full bg-[#0a0a0f] z-50 md:hidden">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <Link href="/" className="flex items-center gap-3" onClick={() => setIsMenuOpen(false)}>
                <div className="relative w-10 h-10">
                  <svg viewBox="0 0 40 40" className="w-full h-full">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="4 4" />
                    <circle cx="20" cy="20" r="10" fill="none" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.5" />
                    <circle cx="20" cy="20" r="3" fill="#38BDF8" />
                  </svg>
                </div>
                <span className="text-lg font-medium tracking-wider text-white" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                  TAL
                </span>
              </Link>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 text-white hover:text-[#38BDF8] transition-colors duration-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 flex flex-col justify-center px-6" style={{ fontFamily: 'var(--font-mono), monospace' }}>
              <div className="space-y-8 text-center">
                {navLinks.map((link) =>
                  link.external ? (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-md font-light transition-all duration-300 tracking-wider text-white hover:text-[#38BDF8]"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={clsx(
                        'block text-md font-light transition-all duration-300 tracking-wider',
                        pathname?.startsWith(link.href)
                          ? 'text-[#38BDF8]'
                          : 'text-white hover:text-[#38BDF8]',
                      )}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
