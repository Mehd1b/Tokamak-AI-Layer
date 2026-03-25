import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page Not Found',
  description: 'The page you are looking for does not exist.',
};

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <h1
        className="text-7xl font-light text-[#A855F7] mb-4"
        style={{ fontFamily: 'var(--font-mono), monospace' }}
      >
        404
      </h1>
      <p className="text-xl text-gray-400 mb-8">
        This page doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="px-6 py-3 rounded-lg border border-[#A855F7]/30 text-[#A855F7] hover:bg-[#A855F7]/10 transition-colors duration-300"
        style={{ fontFamily: 'var(--font-mono), monospace' }}
      >
        Back to Home
      </Link>
    </div>
  );
}
