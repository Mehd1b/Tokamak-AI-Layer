'use client';

import { useRef, useState } from 'react';

export function StatCard({ title, description, children, featured = false }: {
  title: string;
  description: string;
  children: React.ReactNode;
  featured?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const cardContent = (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`group relative flex flex-col p-10 rounded-[32px] border border-white/10 bg-white/[0.02] overflow-hidden transition-all duration-500 h-full ${featured ? 'bg-[#050505]' : ''}`}
    >
      {/* Spotlight hover */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[32px]"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255, 255, 255, 0.06), transparent 40%)`,
        }}
      />
      {/* Hover border glow */}
      <div className="absolute inset-0 rounded-[32px] border border-[#A855F7]/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-50 pointer-events-none" />
      {/* Featured gradient overlay */}
      {featured && (
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent pointer-events-none" />
      )}
      <h3
        className="relative z-10 text-2xl font-light tracking-tight text-white mb-4"
        style={{ fontFamily: 'var(--font-serif), serif' }}
      >
        {title}
      </h3>
      <p
        className="relative z-10 text-sm font-light text-white/50 leading-relaxed mb-12"
        style={{ fontFamily: 'var(--font-mono), monospace' }}
      >
        {description}
      </p>
      <div className="mt-auto relative z-10">{children}</div>
    </div>
  );

  if (featured) {
    return (
      <div className="p-[1px] lg:-mt-8 lg:mb-8 z-20 rounded-[32px] bg-gradient-to-b from-white/20 via-white/5 to-transparent">
        {cardContent}
      </div>
    );
  }

  return cardContent;
}
