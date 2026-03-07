'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DiamondLogoGlow } from '@/components/icons/Logo';
import { GitHubIcon, XIcon, TelegramIcon } from '@/components/icons/Social';

const socialLinks = [
  { name: 'GitHub', href: 'https://github.com/tokamak-network', icon: <GitHubIcon /> },
  { name: 'X', href: 'https://x.com/Tokamak_Network', icon: <XIcon /> },
  { name: 'Telegram', href: 'https://t.me/tokamak_network', icon: <TelegramIcon /> },
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
                <DiamondLogoGlow />
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
                href="/whitepaper"
                className="text-gray-500 hover:text-[#A855F7] transition-colors duration-300 relative group"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Whitepaper
                <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-[#A855F7] group-hover:w-full transition-all duration-300" />
              </Link>
              <a
                href="https://docs.tokagent.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-[#A855F7] transition-colors duration-300 relative group"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Docs
                <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-[#A855F7] group-hover:w-full transition-all duration-300" />
              </a>
              <a
                href="https://github.com/tokamak-network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-[#A855F7] transition-colors duration-300 relative group"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                GitHub
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
