'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const socialLinks = [
  {
    name: 'GitHub',
    href: 'https://github.com/tokamak-network',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.300 24 12c0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
  },
  {
    name: 'X',
    href: 'https://x.com/Tokamak_Network',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
      </svg>
    ),
  },
  {
    name: 'Telegram',
    href: 'https://t.me/tokamak_network',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    ),
  },
];

export function Footer() {
  const footerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.3 },
    );

    if (footerRef.current) {
      observer.observe(footerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <footer ref={footerRef} className="relative bg-[#0a0a0f]">
      {/* Top gradient line */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-[#A855F7]/30 to-transparent" />

      {/* Glow effect at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] bg-gradient-to-r from-transparent via-[#A855F7]/50 to-transparent blur-sm" />

      <div className="relative py-16 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center space-y-10">
            {/* Logo and tagline */}
            <div className={`text-center transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="flex items-center justify-center gap-3 mb-3">
                {/* Interlocking diamonds logo */}
                <div className="relative w-10 h-10">
                  <svg viewBox="0 0 40 40" className="w-full h-full">
                    <path d="M20 4 L30 16 L20 28 L10 16 Z" fill="none" stroke="#A855F7" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.5" />
                    <path d="M20 12 L30 24 L20 36 L10 24 Z" fill="none" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.8" />
                    <circle cx="20" cy="20" r="2.5" fill="#A855F7" style={{ filter: 'drop-shadow(0 0 4px #A855F7)' }} />
                  </svg>
                </div>
                <span
                  className="text-xl font-medium text-white tracking-wider"
                  style={{ fontFamily: 'var(--font-mono), monospace' }}
                >
                  EXECUTION KERNEL
                </span>
              </div>
              <p
                className="text-gray-500 text-sm tracking-wide"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Verifiable Agent Execution with RISC Zero zkVM
              </p>
            </div>

            {/* Social links */}
            <div className={`flex items-center gap-3 transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {socialLinks.map((link, index) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="social-glow"
                  aria-label={link.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ transitionDelay: `${index * 50}ms` }}
                >
                  <div className="social-bg" />
                  <div className="social-glow-effect" />
                  <div className="social-icon">
                    {link.icon}
                  </div>
                </a>
              ))}
            </div>

            {/* Links row */}
            <div className={`flex flex-wrap items-center justify-center gap-8 text-sm transition-all duration-700 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <Link
                href="/agents"
                className="text-gray-500 hover:text-[#A855F7] transition-colors duration-300 relative group"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Agents
                <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-[#A855F7] group-hover:w-full transition-all duration-300" />
              </Link>
              <Link
                href="/vaults"
                className="text-gray-500 hover:text-[#A855F7] transition-colors duration-300 relative group"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Vaults
                <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-[#A855F7] group-hover:w-full transition-all duration-300" />
              </Link>
              <Link
                href="/executions"
                className="text-gray-500 hover:text-[#A855F7] transition-colors duration-300 relative group"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Executions
                <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-[#A855F7] group-hover:w-full transition-all duration-300" />
              </Link>
              <Link
                href="/verify"
                className="text-gray-500 hover:text-[#A855F7] transition-colors duration-300 relative group"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Verify
                <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-[#A855F7] group-hover:w-full transition-all duration-300" />
              </Link>
              <a
                href="https://tokagent.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-[#A855F7] transition-colors duration-300 relative group"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                TAL
                <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-[#A855F7] group-hover:w-full transition-all duration-300" />
              </a>
            </div>

            {/* Divider line */}
            <div className="w-full max-w-md h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Copyright */}
            <div className={`flex flex-col sm:flex-row items-center gap-2 text-gray-600 text-xs transition-all duration-700 delay-400 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <span style={{ fontFamily: 'var(--font-mono), monospace' }}>
                &copy; {new Date().getFullYear()} Execution Kernel
              </span>
              <span className="hidden sm:inline text-gray-700">|</span>
              <span style={{ fontFamily: 'var(--font-mono), monospace' }}>
                Tokamak Network
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
