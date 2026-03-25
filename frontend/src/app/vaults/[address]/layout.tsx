import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokamak.ai';

type Props = {
  params: Promise<{ address: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return {
    title: `Vault ${short}`,
    description: `View details, performance, and execution history for AI strategy vault ${address} on the Tokamak AI Layer protocol.`,
    openGraph: {
      title: `Vault ${short} | Tokamak AI Layer`,
      description: `AI strategy vault ${short} — performance, deposits, and execution history with verifiable zero-knowledge proofs.`,
    },
    alternates: {
      canonical: `${SITE_URL}/vaults/${address}`,
    },
  };
}

export default function VaultDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
