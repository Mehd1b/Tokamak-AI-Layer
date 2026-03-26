import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Detail',
  description:
    'View detailed agent performance, strategy information, and all vaults deployed with this agent on Tokagent.',
  openGraph: {
    title: 'Agent Detail | Tokagent',
    description:
      'View detailed agent performance, strategy information, and all vaults deployed with this agent on Tokagent.',
  },
};

export default function AgentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
