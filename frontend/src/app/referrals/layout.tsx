import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokamak.ai';

export const metadata: Metadata = {
  title: 'Referrals',
  description:
    'Share your referral link, earn points for every deposit made through your code, and track your referral stats on Tokagent.',
  openGraph: {
    title: 'Referrals | Tokagent',
    description:
      'Share your referral link, earn points for every deposit made through your code, and track your referral stats on Tokagent.',
  },
  alternates: {
    canonical: `${SITE_URL}/referrals`,
  },
};

export default function ReferralsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
