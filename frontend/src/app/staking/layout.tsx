import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stake TAL',
  description:
    'Stake TON tokens to receive wsTON and participate in the Tokagent protocol. Wrap, stake, and manage your bond positions.',
  openGraph: {
    title: 'Stake TAL | Tokagent',
    description:
      'Stake TON tokens to receive wsTON and participate in the Tokagent protocol.',
  },
  alternates: {
    canonical: '/staking',
  },
};

export default function StakingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
