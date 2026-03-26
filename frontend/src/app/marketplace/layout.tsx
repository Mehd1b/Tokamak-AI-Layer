import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Marketplace',
  description:
    'Browse, discover, and fork AI agent templates on Tokagent. Find yield, perp trading, market making, and governance strategies.',
  openGraph: {
    title: 'Agent Marketplace | Tokagent',
    description:
      'Browse, discover, and fork AI agent templates on Tokagent. Find yield, perp trading, market making, and governance strategies.',
  },
};

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
