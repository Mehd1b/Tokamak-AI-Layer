export function TokenIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="12" stroke="#d5f972" strokeWidth="1.5" strokeOpacity="0.4" />
      <circle cx="16" cy="16" r="7" stroke="#c4f547" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="2.5" fill="#c4f547" style={{ filter: 'drop-shadow(0 0 3px #c4f547)' }} />
      <line x1="16" y1="4" x2="16" y2="9" stroke="#d5f972" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="16" y1="23" x2="16" y2="28" stroke="#d5f972" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="4" y1="16" x2="9" y2="16" stroke="#d5f972" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="23" y1="16" x2="28" y2="16" stroke="#d5f972" strokeWidth="1" strokeOpacity="0.5" />
    </svg>
  );
}

export function ChartIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <path d="M6 24 L12 17 L17 20 L26 8" stroke="#c4f547" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 24 L12 17 L17 20 L26 8 L26 24 Z" fill="url(#chartGrad)" fillOpacity="0.15" />
      <circle cx="26" cy="8" r="2" fill="#c4f547" style={{ filter: 'drop-shadow(0 0 3px #c4f547)' }} />
      <circle cx="12" cy="17" r="1.5" fill="#c4f547" />
      <circle cx="17" cy="20" r="1.5" fill="#c4f547" />
      <defs>
        <linearGradient id="chartGrad" x1="16" y1="8" x2="16" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c4f547" />
          <stop offset="1" stopColor="#c4f547" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ShieldIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <path d="M16 4 L26 9 L26 16 C26 22 21 27 16 28 C11 27 6 22 6 16 L6 9 Z"
        stroke="#c4f547" strokeWidth="1.5" fill="#c4f547" fillOpacity="0.08" />
      <path d="M16 10 L22 13 L22 17 C22 21 19 24 16 25 C13 24 10 21 10 17 L10 13 Z"
        stroke="#d5f972" strokeWidth="1" strokeOpacity="0.5" fill="none" />
      <circle cx="16" cy="17" r="2" fill="#c4f547" style={{ filter: 'drop-shadow(0 0 3px #c4f547)' }} />
    </svg>
  );
}

export function LockIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <rect x="9" y="14" width="14" height="12" rx="2" stroke="#c4f547" strokeWidth="1.5" fill="#c4f547" fillOpacity="0.08" />
      <path d="M12 14 L12 10 C12 7.8 13.8 6 16 6 C18.2 6 20 7.8 20 10 L20 14"
        stroke="#d5f972" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="16" cy="20" r="2" fill="#c4f547" style={{ filter: 'drop-shadow(0 0 3px #c4f547)' }} />
      <line x1="16" y1="22" x2="16" y2="24" stroke="#c4f547" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function DepositIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <path d="M10 3 L10 13" stroke="#c4f547" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 9 L10 13 L14 9" stroke="#c4f547" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16 L16 16" stroke="#d5f972" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

export function WithdrawIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <path d="M10 13 L10 3" stroke="#c4f547" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 7 L10 3 L14 7" stroke="#c4f547" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16 L16 16" stroke="#d5f972" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

export function SearchIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="9" cy="9" r="5.5" stroke="#d5f972" strokeWidth="1.5" />
      <line x1="13.5" y1="13.5" x2="17" y2="17" stroke="#c4f547" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="9" r="1.5" fill="#c4f547" fillOpacity="0.4" />
    </svg>
  );
}

export function BondLockIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <rect x="5" y="9" width="10" height="8" rx="1.5" stroke="#c4f547" strokeWidth="1.5" fill="#c4f547" fillOpacity="0.08" />
      <path d="M7.5 9 L7.5 7 C7.5 5.1 8.6 3.5 10 3.5 C11.4 3.5 12.5 5.1 12.5 7 L12.5 9"
        stroke="#d5f972" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="10" cy="13" r="1.2" fill="#c4f547" style={{ filter: 'drop-shadow(0 0 2px #c4f547)' }} />
    </svg>
  );
}

export function IndexIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <path d="M8 24 L8 14" stroke="#8ab81d" strokeWidth="2" strokeLinecap="round" />
      <path d="M13 24 L13 10" stroke="#c4f547" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 24 L18 16" stroke="#d5f972" strokeWidth="2" strokeLinecap="round" />
      <path d="M23 24 L23 8" stroke="#c4f547" strokeWidth="2" strokeLinecap="round" />
      <circle cx="23" cy="8" r="2" fill="#c4f547" style={{ filter: 'drop-shadow(0 0 3px #c4f547)' }} />
    </svg>
  );
}

export function CoinsIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <ellipse cx="14" cy="18" rx="8" ry="4" stroke="#d5f972" strokeWidth="1.2" strokeOpacity="0.4" />
      <ellipse cx="14" cy="14" rx="8" ry="4" stroke="#c4f547" strokeWidth="1.5" fill="#c4f547" fillOpacity="0.06" />
      <line x1="6" y1="14" x2="6" y2="18" stroke="#d5f972" strokeWidth="1.2" strokeOpacity="0.4" />
      <line x1="22" y1="14" x2="22" y2="18" stroke="#d5f972" strokeWidth="1.2" strokeOpacity="0.4" />
      <ellipse cx="18" cy="12" rx="8" ry="4" stroke="#c4f547" strokeWidth="1" strokeOpacity="0.3" />
      <circle cx="14" cy="14" r="1.5" fill="#c4f547" style={{ filter: 'drop-shadow(0 0 2px #c4f547)' }} />
    </svg>
  );
}
