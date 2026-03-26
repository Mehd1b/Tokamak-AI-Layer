import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokamak.ai';

export const metadata: Metadata = {
  title: 'Portfolio',
  description:
    'Track your vault positions, unrealized P&L, and transaction history across all Tokagent strategy vaults.',
  openGraph: {
    title: 'Portfolio | Tokagent',
    description:
      'Track your vault positions, unrealized P&L, and transaction history across all Tokagent strategy vaults.',
  },
  alternates: {
    canonical: `${SITE_URL}/portfolio`,
  },
};

export default function PortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
