'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { NetworkSelector } from '@/components/NetworkSelector';
import { DiamondLogo } from '@/components/icons/Logo';
import { XIcon, GitHubIcon, LinkedInIcon } from '@/components/icons/Social';
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
  x: <XIcon className="w-4 h-4" />,
  github: <GitHubIcon className="w-4 h-4" />,
  linkedin: <LinkedInIcon className="w-4 h-4" />,
};

// Protocol dropdown links
const PROTOCOL_LINKS: DropdownLink[] = [
  { title: 'Agents', description: 'Browse registered kernel agents', href: '/agents', internal: true },
  { title: 'Vaults', description: 'Explore and deploy vaults', href: '/vaults', internal: true },
  { title: 'Staking', description: 'WSTON staking and bridge', href: '/staking', internal: true },
];

// Socials dropdown links
const SOCIALS_LINKS: DropdownLink[] = [
  { title: 'X', description: 'Follow us on X', href: 'https://x.com/Tokamak_Network', icon: SOCIAL_ICONS.x },
  { title: 'GitHub', description: 'View the source code', href: 'https://github.com/tokamak-network', icon: SOCIAL_ICONS.github },
  { title: 'LinkedIn', description: 'Connect with us', href: 'https://www.linkedin.com/company/tokamaknetwork/', icon: SOCIAL_ICONS.linkedin },
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
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 sm:px-8 backdrop-blur-md bg-[#0a0a0f]/80 border-b border-white/5">
        {/* Logo - Interlocking Diamonds */}
        <Link href="/" className="group flex items-center gap-3">
          <DiamondLogo />
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
            href="https://docs.tokagent.network"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg border border-dashed transition-all tracking-wider text-sm border-white/30 text-white hover:border-white/60 hover:text-gray-300"
          >
            DOCS
          </a>
          <NetworkSelector />
          <div className="ml-4">
            <ConnectButton />
          </div>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-3 md:hidden">
          <NetworkSelector />
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
                <DiamondLogo />
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
                  href="https://docs.tokagent.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-md font-light transition-all duration-300 tracking-wider text-white hover:text-[#A855F7]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  DOCS
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
