export function DiamondLogo({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <path
          d="M20 4 L30 16 L20 28 L10 16 Z"
          fill="none" stroke="#A855F7" strokeWidth="1.2" strokeOpacity="0.5"
        />
        <path
          d="M20 12 L30 24 L20 36 L10 24 Z"
          fill="none" stroke="#A855F7" strokeWidth="1.2" strokeOpacity="0.3"
        />
        <circle cx="20" cy="20" r="2.5" fill="#A855F7" />
      </svg>
    </div>
  );
}

export function DiamondLogoGlow({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <path d="M20 4 L30 16 L20 28 L10 16 Z" fill="none" stroke="#A855F7" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.5" />
        <path d="M20 12 L30 24 L20 36 L10 24 Z" fill="none" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.8" />
        <circle cx="20" cy="20" r="2.5" fill="#A855F7" style={{ filter: 'drop-shadow(0 0 4px #A855F7)' }} />
      </svg>
    </div>
  );
}
