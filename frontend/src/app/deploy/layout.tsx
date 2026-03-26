import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Deploy Vault',
  description:
    'Deploy a new AI-managed vault on Tokagent. Select an agent, choose an asset, and launch your vault in one click.',
  openGraph: {
    title: 'Deploy Vault | Tokagent',
    description:
      'Deploy a new AI-managed vault on Tokagent. Select an agent, choose an asset, and launch your vault in one click.',
  },
};

export default function DeployLayout({ children }: { children: React.ReactNode }) {
  return children;
}
