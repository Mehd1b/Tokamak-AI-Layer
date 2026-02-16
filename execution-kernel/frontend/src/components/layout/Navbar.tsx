'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { clsx } from 'clsx';
import { useState, useEffect, useRef, useCallback } from 'react';

const ConnectButton = ConnectWalletButton;

// Types for dropdown
interface DropdownLink {
  title: string;
  description: string;
  href: string;
  internal?: boolean;
  icon?: React.ReactNode;
}

// Social icons
const SOCIAL_ICONS = {
  x: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  github: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.300 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  ),
  linkedin: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
};

// Protocol dropdown links
const PROTOCOL_LINKS: DropdownLink[] = [
  { title: 'Agents', description: 'Browse registered kernel agents', href: '/agents', internal: true },
  { title: 'Vaults', description: 'Explore and deploy vaults', href: '/vaults', internal: true },
  { title: 'Executions', description: 'View execution history', href: '/executions', internal: true },
  { title: 'Verify', description: 'Verify proofs on-chain', href: '/verify', internal: true },
];

// Socials dropdown links
const SOCIALS_LINKS: DropdownLink[] = [
  { title: 'X', description: 'Follow us on X', href: 'https://x.com/Tokamak_Network', icon: SOCIAL_ICONS.x },
  { title: 'GitHub', description: 'View the source code', href: 'https://github.com/tokamak-network', icon: SOCIAL_ICONS.github },
  { title: 'LinkedIn', description: 'Connect with us', href: 'https://www.linkedin.com/company/tokamak-network', icon: SOCIAL_ICONS.linkedin },
];

const CLOSE_DELAY = 300;

function useDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPointerInsideRef = useRef(false);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    if (closeTimeoutRef.current) return;
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      setIsOpen(false);
    }, CLOSE_DELAY);
  }, []);

  const isPointInsideDropdown = useCallback((x: number, y: number): boolean => {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    const inTrigger = triggerRef.current?.contains(el) ?? false;
    const inPanel = panelRef.current?.contains(el) ?? false;
    return inTrigger || inPanel;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerMove = (e: PointerEvent) => {
      const inside = isPointInsideDropdown(e.clientX, e.clientY);
      if (inside) {
        clearCloseTimeout();
        isPointerInsideRef.current = true;
      } else {
        if (isPointerInsideRef.current) {
          isPointerInsideRef.current = false;
          scheduleClose();
        }
      }
    };
    const initialCheck = setTimeout(() => {
      isPointerInsideRef.current = true;
    }, 10);
    document.addEventListener('pointermove', handlePointerMove);
    return () => {
      clearTimeout(initialCheck);
      document.removeEventListener('pointermove', handlePointerMove);
    };
  }, [isOpen, isPointInsideDropdown, clearCloseTimeout, scheduleClose]);

  const handleTriggerPointerEnter = useCallback(() => {
    clearCloseTimeout();
    isPointerInsideRef.current = true;
    setIsOpen(true);
  }, [clearCloseTimeout]);

  const handleTriggerPointerLeave = useCallback((e: React.PointerEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    const goingToPanel = relatedTarget && panelRef.current?.contains(relatedTarget);
    if (!goingToPanel) {
      isPointerInsideRef.current = false;
      scheduleClose();
    }
  }, [scheduleClose]);

  const handlePanelPointerEnter = useCallback(() => {
    clearCloseTimeout();
    isPointerInsideRef.current = true;
  }, [clearCloseTimeout]);

  const handlePanelPointerLeave = useCallback((e: React.PointerEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    const goingToTrigger = relatedTarget && triggerRef.current?.contains(relatedTarget);
    if (!goingToTrigger) {
      isPointerInsideRef.current = false;
      scheduleClose();
    }
  }, [scheduleClose]);

  const handleClick = useCallback(() => {
    clearCloseTimeout();
    setIsOpen(prev => !prev);
  }, [clearCloseTimeout]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        clearCloseTimeout();
        setIsOpen(prev => !prev);
        break;
      case 'Escape':
        clearCloseTimeout();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) { clearCloseTimeout(); setIsOpen(true); }
        setTimeout(() => {
          const firstItem = panelRef.current?.querySelector('a');
          firstItem?.focus();
        }, 0);
        break;
    }
  }, [isOpen, clearCloseTimeout]);

  const handleMenuItemKeyDown = useCallback((e: React.KeyboardEvent, index: number, totalItems: number) => {
    const items = panelRef.current?.querySelectorAll('a');
    if (!items) return;
    switch (e.key) {
      case 'Escape':
        clearCloseTimeout();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        (items[(index + 1) % totalItems] as HTMLElement)?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        (items[(index - 1 + totalItems) % totalItems] as HTMLElement)?.focus();
        break;
      case 'Tab':
        if (!e.shiftKey && index === totalItems - 1) setIsOpen(false);
        break;
    }
  }, [clearCloseTimeout]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        clearCloseTimeout();
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isOpen, clearCloseTimeout]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearCloseTimeout();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, clearCloseTimeout]);

  useEffect(() => {
    return () => { if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current); };
  }, []);

  const calculatePanelPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const buttonRect = triggerRef.current.getBoundingClientRect();
    const panelWidth = 280;
    const viewportPadding = 16;
    let left = 0;
    const rightEdge = buttonRect.left + panelWidth;
    if (rightEdge > window.innerWidth - viewportPadding) {
      left = -(rightEdge - (window.innerWidth - viewportPadding));
    }
    setPanelPosition({ left });
  }, []);

  useEffect(() => {
    if (isOpen) {
      calculatePanelPosition();
      window.addEventListener('resize', calculatePanelPosition);
      return () => window.removeEventListener('resize', calculatePanelPosition);
    }
  }, [isOpen, calculatePanelPosition]);

  return {
    isOpen, setIsOpen, panelPosition, triggerRef, panelRef,
    handleTriggerPointerEnter, handleTriggerPointerLeave,
    handlePanelPointerEnter, handlePanelPointerLeave,
    handleClick, handleKeyDown, handleMenuItemKeyDown,
  };
}

export function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileProtocolOpen, setIsMobileProtocolOpen] = useState(false);
  const [isMobileSocialsOpen, setIsMobileSocialsOpen] = useState(false);

  const protocol = useDropdown();
  const socials = useDropdown();

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
        {/* Logo - Interlocking Diamonds */}
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative w-10 h-10">
            <svg viewBox="0 0 40 40" className="w-full h-full">
              <path
                d="M20 4 L30 16 L20 28 L10 16 Z"
                fill="none" stroke="#A855F7" strokeWidth="1.2" strokeOpacity="0.5"
                className="group-hover:stroke-opacity-80 transition-all duration-300"
              />
              <path
                d="M20 12 L30 24 L20 36 L10 24 Z"
                fill="none" stroke="#A855F7" strokeWidth="1.2" strokeOpacity="0.3"
                className="group-hover:stroke-opacity-60 transition-all duration-300"
              />
              <circle
                cx="20" cy="20" r="2.5"
                fill="#A855F7"
                className="group-hover:filter group-hover:drop-shadow-[0_0_6px_#A855F7] transition-all duration-300"
              />
            </svg>
          </div>
          <span
            className="text-lg font-medium tracking-wider text-white group-hover:text-[#A855F7] transition-colors duration-300"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            Execution Kernel
          </span>
        </Link>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>

          {/* PROTOCOL Dropdown */}
          <div className="relative">
            <button
              ref={protocol.triggerRef}
              onClick={protocol.handleClick}
              onKeyDown={protocol.handleKeyDown}
              onPointerEnter={protocol.handleTriggerPointerEnter}
              onPointerLeave={protocol.handleTriggerPointerLeave}
              className={clsx(
                'flex items-center gap-1 px-4 py-2 rounded-lg border border-dashed transition-all tracking-wider text-sm',
                PROTOCOL_LINKS.some(l => pathname?.startsWith(l.href))
                  ? 'border-[#A855F7]/60 text-[#A855F7]'
                  : 'border-white/30 text-white hover:border-white/60 hover:text-gray-300',
              )}
              aria-haspopup="true"
              aria-expanded={protocol.isOpen}
            >
              PROTOCOL
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${protocol.isOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div
              ref={protocol.panelRef}
              role="menu"
              onPointerEnter={protocol.handlePanelPointerEnter}
              onPointerLeave={protocol.handlePanelPointerLeave}
              className={`absolute top-full mt-2 w-[280px] p-4 space-y-1
                rounded-xl border border-[#A855F7]/30
                backdrop-blur-md bg-[#0a0a0f]/90
                transition-all duration-200 origin-top-left z-50
                ${protocol.isOpen
                  ? 'opacity-100 scale-100 visible pointer-events-auto'
                  : 'opacity-0 scale-95 invisible pointer-events-none'}`}
              style={{ left: protocol.panelPosition ? protocol.panelPosition.left : 0 }}
            >
              {PROTOCOL_LINKS.map((link, index) => (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  className={clsx(
                    'flex items-center gap-3 p-2.5 -mx-1 rounded-lg hover:bg-[#A855F7]/10 transition-colors group',
                    pathname?.startsWith(link.href) && 'bg-[#A855F7]/5',
                  )}
                  onClick={() => protocol.setIsOpen(false)}
                  onKeyDown={(e) => protocol.handleMenuItemKeyDown(e, index, PROTOCOL_LINKS.length)}
                >
                  <div>
                    <div className={clsx(
                      'text-sm font-medium group-hover:text-[#A855F7] transition-colors',
                      pathname?.startsWith(link.href) ? 'text-[#A855F7]' : 'text-white',
                    )}>
                      {link.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {link.description}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* SOCIALS Dropdown */}
          <div className="relative">
            <button
              ref={socials.triggerRef}
              onClick={socials.handleClick}
              onKeyDown={socials.handleKeyDown}
              onPointerEnter={socials.handleTriggerPointerEnter}
              onPointerLeave={socials.handleTriggerPointerLeave}
              className="flex items-center gap-1 px-4 py-2 rounded-lg border border-dashed border-white/30 text-white hover:border-white/60 hover:text-gray-300 transition-all tracking-wider text-sm"
              aria-haspopup="true"
              aria-expanded={socials.isOpen}
            >
              SOCIALS
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${socials.isOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div
              ref={socials.panelRef}
              role="menu"
              onPointerEnter={socials.handlePanelPointerEnter}
              onPointerLeave={socials.handlePanelPointerLeave}
              className={`absolute top-full mt-2 w-[260px] p-4 space-y-1
                rounded-xl border border-[#A855F7]/30
                backdrop-blur-md bg-[#0a0a0f]/90
                transition-all duration-200 origin-top-left z-50
                ${socials.isOpen
                  ? 'opacity-100 scale-100 visible pointer-events-auto'
                  : 'opacity-0 scale-95 invisible pointer-events-none'}`}
              style={{ left: socials.panelPosition ? socials.panelPosition.left : 0 }}
            >
              {SOCIALS_LINKS.map((link, index) => (
                <a
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  className="flex items-center gap-3 p-2.5 -mx-1 rounded-lg hover:bg-[#A855F7]/10 transition-colors group"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => socials.setIsOpen(false)}
                  onKeyDown={(e) => socials.handleMenuItemKeyDown(e, index, SOCIALS_LINKS.length)}
                >
                  {link.icon && (
                    <span className="text-gray-400 group-hover:text-[#A855F7] transition-colors">
                      {link.icon}
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-medium text-white group-hover:text-[#A855F7] transition-colors">
                      {link.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {link.description}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <Link
            href="/whitepaper"
            className={clsx(
              'px-4 py-2 rounded-lg border border-dashed transition-all tracking-wider text-sm',
              pathname === '/whitepaper'
                ? 'border-[#A855F7]/60 text-[#A855F7]'
                : 'border-white/30 text-white hover:border-white/60 hover:text-gray-300',
            )}
          >
            WHITEPAPER
          </Link>
          <a
            href="https://docs.execution.tokagent.network"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg border border-dashed transition-all tracking-wider text-sm border-white/30 text-white hover:border-white/60 hover:text-gray-300"
          >
            DOCS
          </a>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.open('https://tokagent.network', '_blank');
            }}
            className="px-4 py-2 rounded-lg border border-dashed transition-all tracking-wider text-sm border-white/30 text-white hover:border-white/60 hover:text-gray-300"
          >
            TAL
          </a>
          <div className="ml-4">
            <ConnectButton />
          </div>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-3 md:hidden">
          <ConnectButton />
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="relative group p-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm hover:border-[#A855F7]/50 transition-all duration-300"
            aria-label="Toggle menu"
          >
            <div className="w-6 h-6 flex flex-col justify-center items-center">
              <span className={`block w-5 h-0.5 bg-current transform transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-1' : ''} group-hover:bg-[#A855F7]`} />
              <span className={`block w-5 h-0.5 bg-current mt-1 transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''} group-hover:bg-[#A855F7]`} />
              <span className={`block w-5 h-0.5 bg-current mt-1 transform transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-1' : ''} group-hover:bg-[#A855F7]`} />
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
                    <path d="M20 4 L30 16 L20 28 L10 16 Z" fill="none" stroke="#A855F7" strokeWidth="1.2" strokeOpacity="0.5" />
                    <path d="M20 12 L30 24 L20 36 L10 24 Z" fill="none" stroke="#A855F7" strokeWidth="1.2" strokeOpacity="0.3" />
                    <circle cx="20" cy="20" r="2.5" fill="#A855F7" />
                  </svg>
                </div>
                <span className="text-lg font-medium tracking-wider text-white" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                  EK
                </span>
              </Link>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 text-white hover:text-[#A855F7] transition-colors duration-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 flex flex-col justify-center px-6" style={{ fontFamily: 'var(--font-mono), monospace' }}>
              <div className="space-y-8 text-center">

                {/* Mobile PROTOCOL Accordion */}
                <div className="text-center">
                  <button
                    onClick={() => setIsMobileProtocolOpen(prev => !prev)}
                    className="inline-flex items-center gap-2 text-md font-light text-white hover:text-[#A855F7] transition-all duration-300 tracking-wider"
                    aria-expanded={isMobileProtocolOpen}
                  >
                    PROTOCOL
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${isMobileProtocolOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      isMobileProtocolOpen ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="space-y-3 text-sm">
                      {PROTOCOL_LINKS.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={clsx(
                            'block transition-colors',
                            pathname?.startsWith(link.href)
                              ? 'text-[#A855F7]'
                              : 'text-gray-300 hover:text-[#A855F7]',
                          )}
                          onClick={() => {
                            setIsMenuOpen(false);
                            setIsMobileProtocolOpen(false);
                          }}
                        >
                          {link.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Mobile SOCIALS Accordion */}
                <div className="text-center">
                  <button
                    onClick={() => setIsMobileSocialsOpen(prev => !prev)}
                    className="inline-flex items-center gap-2 text-md font-light text-white hover:text-[#A855F7] transition-all duration-300 tracking-wider"
                    aria-expanded={isMobileSocialsOpen}
                  >
                    SOCIALS
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${isMobileSocialsOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      isMobileSocialsOpen ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="space-y-3 text-sm">
                      {SOCIALS_LINKS.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          className="block text-gray-300 hover:text-[#A855F7] transition-colors"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            setIsMenuOpen(false);
                            setIsMobileSocialsOpen(false);
                          }}
                        >
                          {link.title}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                <Link
                  href="/whitepaper"
                  className={clsx(
                    'block text-md font-light transition-all duration-300 tracking-wider',
                    pathname === '/whitepaper' ? 'text-[#A855F7]' : 'text-white hover:text-[#A855F7]',
                  )}
                  onClick={() => setIsMenuOpen(false)}
                >
                  WHITEPAPER
                </Link>
                <a
                  href="https://docs.execution.tokagent.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-md font-light transition-all duration-300 tracking-wider text-white hover:text-[#A855F7]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  DOCS
                </a>
                <a
                  href="https://tokagent.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-md font-light transition-all duration-300 tracking-wider text-white hover:text-[#A855F7]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  TAL
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
