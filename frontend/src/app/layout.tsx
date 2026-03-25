import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Analytics } from '@vercel/analytics/react';
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});
const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokamak.ai';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Tokagent — Verifiable Agent Execution on Ethereum',
    template: '%s | Tokagent',
  },
  description:
    'Verifiable ML agent execution with RISC Zero zkVM on Ethereum. Deploy autonomous DeFi strategy vaults with zero-knowledge proofs.',
  openGraph: {
    title: 'Tokagent — Verifiable Agent Execution on Ethereum',
    description:
      'Verifiable ML agent execution with RISC Zero zkVM on Ethereum. Deploy autonomous DeFi strategy vaults with zero-knowledge proofs.',
    siteName: 'Tokagent',
    type: 'website',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tokagent — Verifiable Agent Execution on Ethereum',
    description:
      'Verifiable ML agent execution with RISC Zero zkVM on Ethereum. Deploy autonomous DeFi strategy vaults with zero-knowledge proofs.',
  },
  icons: {
    icon: '/icon.svg',
  },
  themeColor: '#0a0a0f',
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${playfair.variable} dark`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  name: 'Tokagent',
                  url: SITE_URL,
                  logo: `${SITE_URL}/icon.svg`,
                  description:
                    'Verifiable ML agent execution with RISC Zero zkVM on Ethereum.',
                  sameAs: [
                    'https://github.com/tokamak-network',
                  ],
                },
                {
                  '@type': 'WebApplication',
                  name: 'Tokagent',
                  url: SITE_URL,
                  applicationCategory: 'DeFi',
                  operatingSystem: 'Web',
                  description:
                    'Deploy autonomous DeFi strategy vaults with verifiable zero-knowledge execution on Ethereum.',
                  offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'USD',
                  },
                },
              ],
            }),
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col bg-[#0a0a0f]">
        <Providers>
          <Navbar />
          <main className="relative z-10 flex-1 pt-20">{children}</main>
          <Footer />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
