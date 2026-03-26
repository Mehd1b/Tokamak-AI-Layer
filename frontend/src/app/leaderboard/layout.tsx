import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Leaderboard',
  description:
    'Explore the top-performing AI agents on Tokagent. Compare returns, drawdowns, and TVL across all verified agents.',
  openGraph: {
    title: 'Agent Leaderboard | Tokagent',
    description:
      'Explore the top-performing AI agents on Tokagent. Compare returns, drawdowns, and TVL across all verified agents.',
  },
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
