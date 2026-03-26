import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
  description:
    'Configure notifications for your Tokagent vaults. Link your Telegram account to receive real-time alerts for vault executions and PPS changes.',
  openGraph: {
    title: 'Settings | Tokagent',
    description:
      'Configure notifications for your Tokagent vaults via Telegram.',
  },
  alternates: {
    canonical: '/settings',
  },
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
