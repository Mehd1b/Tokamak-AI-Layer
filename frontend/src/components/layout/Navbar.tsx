'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { clsx } from 'clsx';

const navLinks = [
  { href: '/agents', label: 'Agents' },
  { href: '/validation', label: 'Validation' },
  { href: '/staking', label: 'Staking' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tokamak-600">
              <span className="text-sm font-bold text-white">T</span>
            </div>
            <span className="text-lg font-bold text-gray-900">TAL</span>
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'text-sm font-medium transition-colors',
                  pathname?.startsWith(link.href)
                    ? 'text-tokamak-600'
                    : 'text-gray-600 hover:text-gray-900',
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <ConnectButton />
      </nav>
    </header>
  );
}
