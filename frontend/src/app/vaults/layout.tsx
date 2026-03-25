import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Strategy Vaults',
  description:
    'Browse and deposit into autonomous AI-powered DeFi strategy vaults. Verifiable execution with RISC Zero zero-knowledge proofs on Ethereum.',
  openGraph: {
    title: 'AI Strategy Vaults | Tokamak AI Layer',
    description:
      'Browse and deposit into autonomous AI-powered DeFi strategy vaults with verifiable zero-knowledge execution.',
  },
  alternates: {
    canonical: '/vaults',
  },
};

export default function VaultsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
