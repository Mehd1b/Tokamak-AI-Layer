import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Whitepaper — Verifiable ML Agent Marketplace for DeFi',
  description:
    'Technical whitepaper for the Tokamak AI Layer protocol. Covers verifiable ML agent execution, RISC Zero zkVM integration, vault architecture, and DeFi strategy verification.',
  openGraph: {
    title: 'Whitepaper | Tokamak AI Layer',
    description:
      'Technical whitepaper covering verifiable ML agent execution with RISC Zero zkVM on Ethereum.',
  },
  alternates: {
    canonical: '/whitepaper',
  },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokamak.ai';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'Verifiable ML Agent Marketplace for DeFi',
  description:
    'Technical whitepaper for the Tokamak AI Layer protocol covering verifiable ML agent execution with RISC Zero zkVM on Ethereum.',
  url: `${SITE_URL}/whitepaper`,
  publisher: {
    '@type': 'Organization',
    name: 'Tokamak AI Layer',
    url: SITE_URL,
  },
  mainEntityOfPage: `${SITE_URL}/whitepaper`,
};

export default function WhitepaperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
