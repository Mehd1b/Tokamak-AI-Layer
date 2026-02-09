'use client';

import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900">Failed to load reputation data</h2>
        <p className="mt-2 text-sm text-gray-600">
          {error.message || 'An error occurred while loading reputation data.'}
        </p>
        <div className="mt-6 flex items-center justify-center gap-4">
          <button onClick={reset} className="btn-primary">
            Try Again
          </button>
          <Link href="/agents" className="btn-secondary">
            Back to Agents
          </Link>
        </div>
      </div>
    </div>
  );
}
