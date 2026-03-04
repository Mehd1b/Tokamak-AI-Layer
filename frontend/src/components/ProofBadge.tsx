'use client';

export function ProofBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="badge-success">
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
          <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z" />
        </svg>
        Verified
      </span>
    );
  }

  return (
    <span className="badge-error">
      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
        <path d="M2.343 13.657A8 8 0 1113.657 2.343 8 8 0 012.343 13.657zM6.03 4.97a.75.75 0 00-1.06 1.06L6.94 8 4.97 9.97a.75.75 0 101.06 1.06L8 9.06l1.97 1.97a.75.75 0 101.06-1.06L9.06 8l1.97-1.97a.75.75 0 10-1.06-1.06L8 6.94 6.03 4.97z" />
      </svg>
      Invalid
    </span>
  );
}
