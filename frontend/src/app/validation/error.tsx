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
        <h2 className="text-xl font-bold text-gray-900">Failed to load validation data</h2>
        <p className="mt-2 text-sm text-gray-600">
          {error.message || 'An error occurred while loading validation data.'}
        </p>
        <div className="mt-6 flex items-center justify-center gap-4">
          <button onClick={reset} className="btn-primary">
            Try Again
          </button>
          <Link href="/validation" className="btn-secondary">
            Back to Validations
          </Link>
        </div>
      </div>
    </div>
  );
}
