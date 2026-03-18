'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { StatCard } from '@/components/StatCard';
import AuroraBackground from '@/components/AuroraBackground';

/* Redesigned SVG Icons — Purple geometric style */

function VerifiableIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {/* Geometric shield */}
      <path
        d="M32 6 L54 18 V42 L32 54 L10 42 V18 Z"
        stroke="#A855F7" strokeWidth="1.2" strokeOpacity="0.3"
        fill="rgba(168, 85, 247, 0.03)"
      />
      <path
        d="M32 14 L48 23 V39 L32 48 L16 39 V23 Z"
        stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5"
        fill="rgba(168, 85, 247, 0.05)"
      />
      {/* Checkmark */}
      <path
        d="M24 33 L30 39 L42 25"
        stroke="#A855F7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 4px #A855F7)' }}
      />
      {/* Corner accents */}
      <circle cx="32" cy="6" r="1.5" fill="#A855F7" fillOpacity="0.5" />
      <circle cx="54" cy="18" r="1" fill="#C084FC" fillOpacity="0.3" />
    </svg>
  );
}

function VaultIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {/* Vault body */}
      <rect x="14" y="18" width="36" height="28" rx="3" stroke="#A855F7" strokeWidth="1.2" strokeOpacity="0.4" fill="rgba(168, 85, 247, 0.03)" />
      {/* Lock rings */}
      <circle cx="32" cy="32" r="8" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" />
      <circle cx="32" cy="32" r="3" fill="#A855F7" style={{ filter: 'drop-shadow(0 0 4px #A855F7)' }} />
      {/* Handle bars */}
      <line x1="42" y1="28" x2="46" y2="28" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      <line x1="42" y1="36" x2="46" y2="36" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      {/* Status dot */}
      <circle cx="20" cy="24" r="1.5" fill="#A855F7" fillOpacity="0.5">
        <animate attributeName="fill-opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function AgentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {/* Neural network nodes */}
      <circle cx="32" cy="16" r="3.5" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" fill="rgba(168, 85, 247, 0.1)" />
      <circle cx="18" cy="32" r="3.5" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" fill="rgba(168, 85, 247, 0.08)" />
      <circle cx="46" cy="32" r="3.5" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" fill="rgba(168, 85, 247, 0.08)" />
      <circle cx="24" cy="48" r="3.5" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" fill="rgba(168, 85, 247, 0.06)" />
      <circle cx="40" cy="48" r="3.5" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" fill="rgba(168, 85, 247, 0.06)" />
      {/* Connections */}
      <line x1="32" y1="20" x2="18" y2="28" stroke="#A855F7" strokeWidth="0.8" strokeOpacity="0.25" />
      <line x1="32" y1="20" x2="46" y2="28" stroke="#A855F7" strokeWidth="0.8" strokeOpacity="0.25" />
      <line x1="18" y1="36" x2="24" y2="44" stroke="#A855F7" strokeWidth="0.8" strokeOpacity="0.2" />
      <line x1="46" y1="36" x2="40" y2="44" stroke="#A855F7" strokeWidth="0.8" strokeOpacity="0.2" />
      <line x1="18" y1="36" x2="40" y2="44" stroke="#C084FC" strokeWidth="0.5" strokeOpacity="0.15" />
      <line x1="46" y1="36" x2="24" y2="44" stroke="#C084FC" strokeWidth="0.5" strokeOpacity="0.15" />
      {/* Center highlights */}
      <circle cx="32" cy="16" r="1.5" fill="#A855F7" fillOpacity="0.7" />
      <circle cx="18" cy="32" r="1.5" fill="#A855F7" fillOpacity="0.4" />
      <circle cx="46" cy="32" r="1.5" fill="#A855F7" fillOpacity="0.4" />
    </svg>
  );
}

function SettlementIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {/* Chain blocks */}
      <rect x="8" y="24" width="14" height="14" rx="2" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.4" fill="rgba(168, 85, 247, 0.04)" />
      <rect x="25" y="24" width="14" height="14" rx="2" stroke="#A855F7" strokeWidth="1.5" strokeOpacity="0.6" fill="rgba(168, 85, 247, 0.06)" />
      <rect x="42" y="24" width="14" height="14" rx="2" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.4" fill="rgba(168, 85, 247, 0.04)" />
      {/* Links */}
      <line x1="22" y1="31" x2="25" y2="31" stroke="#A855F7" strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="39" y1="31" x2="42" y2="31" stroke="#A855F7" strokeWidth="1.5" strokeOpacity="0.5" />
      {/* Center glow */}
      <circle cx="32" cy="31" r="3" fill="#A855F7" fillOpacity="0.3">
        <animate attributeName="fill-opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Diamond */}
      <path d="M32 12 L38 20 L32 24 L26 20 Z" stroke="#C084FC" strokeWidth="1" strokeOpacity="0.3" fill="rgba(168, 85, 247, 0.04)" />
    </svg>
  );
}

const features = [
  {
    icon: VerifiableIcon,
    title: 'Verifiable Execution',
    description:
      'RISC Zero zkVM generates cryptographic proofs that agent computations were executed correctly.',
    href: '/vaults',
    number: '01',
  },
  {
    icon: VaultIcon,
    title: 'Vault Architecture',
    description:
      'ERC-4626-style vaults with ZK-verified state transitions. Deposit, execute, and settle atomically.',
    href: '/vaults',
    number: '02',
  },
  {
    icon: AgentIcon,
    title: 'Permissionless Agents',
    description:
      'Register any agent with an agent code hash and zkVM image ID. Fully open and composable.',
    href: '/agents',
    number: '03',
  },
  {
    icon: SettlementIcon,
    title: 'On-Chain Settlement',
    description:
      'Proofs are verified on Ethereum. State roots are updated atomically with each execution.',
    href: '/vaults',
    number: '04',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Register Agent',
    description: 'Deploy your agent with an agent code hash and RISC Zero zkVM image ID to the on-chain registry.',
  },
  {
    step: '02',
    title: 'Deploy Vault',
    description: 'Create an ERC-4626 vault that holds assets and tracks state roots for your agent.',
  },
  {
    step: '03',
    title: 'Execute & Prove',
    description: 'Run agent computations inside the zkVM. Generate cryptographic proofs of correct execution.',
  },
  {
    step: '04',
    title: 'Settle On-Chain',
    description: 'Submit proofs to Ethereum. State roots update atomically and assets are distributed.',
  },
];

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);

  const featureSectionRef = useRef<HTMLDivElement>(null);
  const howItWorksSectionRef = useRef<HTMLDivElement>(null);
  const [isFeatureVisible, setIsFeatureVisible] = useState(false);
  const [isHowItWorksVisible, setIsHowItWorksVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [spotlights, setSpotlights] = useState<{ x: number; y: number }[]>(
    features.map(() => ({ x: 50, y: 50 }))
  );

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Intersection observers
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target === featureSectionRef.current) setIsFeatureVisible(true);
            if (entry.target === howItWorksSectionRef.current) setIsHowItWorksVisible(true);
          }
        });
      },
      { threshold: 0.15 }
    );
    if (featureSectionRef.current) observer.observe(featureSectionRef.current);
    if (howItWorksSectionRef.current) observer.observe(howItWorksSectionRef.current);
    return () => observer.disconnect();
  }, []);

  const handleCardMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>, index: number) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSpotlights((prev) => {
      const next = [...prev];
      next[index] = { x, y };
      return next;
    });
  }, []);

  return (
    <div>
      {/* Aurora — fixed behind everything, visible through the transparent navbar */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
        <AuroraBackground />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden">

        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-12 flex flex-col lg:flex-row items-center justify-between gap-12 pt-32 pb-20 lg:py-20">
          {/* Left Side - Text */}
          <div className="flex-1 max-w-2xl text-center lg:text-left">
            <h1
              className={`text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-light leading-tight mb-6 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{
                fontFamily: 'var(--font-serif), serif',
                transitionDelay: '200ms',
              }}
            >
              <span className="block text-white">
                <span className="italic">Verifiable</span> Agent
              </span>
              <span className="block mt-2">
                <span
                  className="italic"
                  style={{
                    background: 'linear-gradient(90deg, #7C3AED, #A855F7, #D946EF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Execution
                </span>
              </span>
            </h1>

            <p
              className={`text-lg md:text-xl text-gray-400 max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ transitionDelay: '600ms' }}
            >
              The execution and settlement layer for autonomous AI agents.
              Deploy vaults, execute strategies, and verify proofs with{' '}
              <span className="text-[#A855F7]">RISC Zero zkVM</span> on Ethereum.
            </p>

            {/* CTA Buttons */}
            <div
              className={`flex flex-wrap justify-center lg:justify-start gap-4 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ transitionDelay: '800ms' }}
            >
              <Link href="/vaults" className="shiny-cta group">
                <span className="shiny-cta-text">
                  Explore Vaults
                  <svg
                    className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
              </Link>

            </div>
          </div>

          {/* Mobile Hero Visualization */}
          <div
            className={`flex lg:hidden justify-center mt-8 transition-all duration-1000 ${isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
            style={{ transitionDelay: '400ms' }}
          >
            <div className="relative">
              <div
                className="absolute inset-0 -m-8 rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%)',
                }}
              />
              <div
                className="w-24 h-24 rounded-2xl border border-[#A855F7]/30 bg-[#0a0a0f]/80 flex items-center justify-center backdrop-blur-sm"
                style={{ boxShadow: '0 0 40px rgba(168, 85, 247, 0.2)' }}
              >
                <span
                  className="text-[#A855F7] text-3xl font-light"
                  style={{ fontFamily: 'var(--font-mono), monospace', filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.5))' }}
                >
                  EK
                </span>
              </div>
              <span
                className="block text-center mt-3 text-[10px] uppercase tracking-[0.2em] text-[#A855F7]/60"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                zkVM Verified
              </span>
            </div>
          </div>

          {/* Right Side - Radar Visualization */}
          <div
            className={`hidden lg:flex flex-1 justify-center lg:justify-end transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
            style={{ transitionDelay: '400ms' }}
          >
            <div className="relative w-[450px] h-[550px] md:w-[600px] md:h-[700px] lg:w-[700px] lg:h-[850px]">
              {/* Glow behind radar */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[500px] md:h-[500px] rounded-full pointer-events-none animate-breathe"
                style={{
                  background: 'radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, rgba(168, 85, 247, 0.08) 50%, transparent 70%)',
                }}
              />

              <svg viewBox="0 0 600 600" className="w-full h-full">
                <defs>
                  <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#A855F7" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#A855F7" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Pulsing Glow */}
                <circle cx="300" cy="300" r="120" fill="url(#center-glow)" className="animate-pulse-glow" />

                {/* Sonar Waves */}
                {[0, 1, 2].map((i) => (
                  <circle
                    key={`sonar-${i}`}
                    cx="300" cy="300" r="10"
                    fill="none" stroke="#A855F7" strokeWidth="1"
                    className="sonar-wave"
                    style={{ animationDelay: `${i}s` }}
                  />
                ))}

                {/* Outer Dashed Orbit */}
                <circle
                  cx="300" cy="300" r="160"
                  fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="1"
                  strokeDasharray="10 20" shapeRendering="geometricPrecision"
                  className="animate-spin-slow"
                  style={{ transformOrigin: '300px 300px' }}
                />

                {/* Inner Dashed Orbit */}
                <circle
                  cx="300" cy="300" r="110"
                  fill="none" stroke="#A855F7" strokeOpacity="0.2" strokeWidth="1"
                  strokeDasharray="4 6" shapeRendering="geometricPrecision"
                  className="animate-spin-slower"
                  style={{ transformOrigin: '300px 300px' }}
                />

                {/* Bezier Lines - Upper Left */}
                <path d="M 50 200 C 150 200, 200 300, 300 300" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
                <path d="M 50 200 C 150 200, 200 300, 300 300" fill="none" stroke="#A855F7" strokeWidth="1.5" strokeDasharray="80 320" strokeDashoffset="320" opacity="0" shapeRendering="geometricPrecision">
                  <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="0s" fill="freeze" />
                  <animate attributeName="stroke-dashoffset" from="320" to="-80" dur="3s" repeatCount="indefinite" calcMode="linear" />
                </path>

                {/* Bezier Lines - Lower Left */}
                <path d="M 50 400 C 150 400, 200 300, 300 300" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
                <path d="M 50 400 C 150 400, 200 300, 300 300" fill="none" stroke="#A855F7" strokeWidth="1.5" strokeDasharray="80 320" strokeDashoffset="320" opacity="0" shapeRendering="geometricPrecision">
                  <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="1.5s" fill="freeze" />
                  <animate attributeName="stroke-dashoffset" from="320" to="-80" dur="3s" begin="1.5s" repeatCount="indefinite" calcMode="linear" />
                </path>

                {/* Bezier Lines - Upper Right */}
                <path d="M 550 200 C 450 200, 400 300, 300 300" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
                <path d="M 550 200 C 450 200, 400 300, 300 300" fill="none" stroke="#A855F7" strokeWidth="1.5" strokeDasharray="60 320" strokeDashoffset="320" opacity="0" shapeRendering="geometricPrecision">
                  <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="0.75s" fill="freeze" />
                  <animate attributeName="stroke-dashoffset" from="320" to="-60" dur="3s" begin="0.75s" repeatCount="indefinite" calcMode="linear" />
                </path>

                {/* Bezier Lines - Lower Right */}
                <path d="M 550 400 C 450 400, 400 300, 300 300" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
                <path d="M 550 400 C 450 400, 400 300, 300 300" fill="none" stroke="#C084FC" strokeWidth="1.5" strokeDasharray="60 320" strokeDashoffset="320" opacity="0" shapeRendering="geometricPrecision">
                  <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="2.25s" fill="freeze" />
                  <animate attributeName="stroke-dashoffset" from="320" to="-60" dur="3s" begin="2.25s" repeatCount="indefinite" calcMode="linear" />
                </path>

                {/* Center Focal Point */}
                <circle cx="300" cy="300" r="8" fill="#0A0A0A" stroke="#A855F7" strokeWidth="2" />
                <circle cx="300" cy="300" r="4" fill="#A855F7" style={{ filter: 'drop-shadow(0 0 6px #A855F7)' }} />

                {/* Data Points */}
                <circle cx="200" cy="220" r="2" fill="#A855F7" fillOpacity="0.6" />
                <circle cx="380" cy="180" r="1.5" fill="#C084FC" fillOpacity="0.4" />
                <circle cx="420" cy="350" r="2" fill="#A855F7" fillOpacity="0.5" />
                <circle cx="180" cy="380" r="1.5" fill="#C084FC" fillOpacity="0.3" />
                <circle cx="350" cy="420" r="2" fill="#A855F7" fillOpacity="0.4" />
                <circle cx="240" cy="160" r="1.5" fill="#C084FC" fillOpacity="0.5" />

                {/* ZK VERIFIED Label */}
                <g transform="translate(80, 120)">
                  <text fill="#A855F7" fontSize="12" letterSpacing="1.2" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                    ZK VERIFIED
                  </text>
                  <line x1="0" y1="16" x2="85" y2="16" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" />
                </g>

                {/* ON-CHAIN Label */}
                <g transform="translate(420, 480)">
                  <text fill="#A855F7" fontSize="12" letterSpacing="1.2" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                    ON-CHAIN
                  </text>
                  <line x1="0" y1="16" x2="70" y2="16" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" />
                </g>

                {/* Status Indicators */}
                <g transform="translate(520, 300)">
                  <rect x="0" y="0" width="4" height="4" fill="rgba(255,255,255,0.2)" />
                  <rect x="8" y="0" width="4" height="4" fill="rgba(255,255,255,0.2)" />
                  <rect x="16" y="0" width="4" height="4" fill="#A855F7" className="animate-pulse" />
                </g>
              </svg>
            </div>
          </div>
        </div>

        {/* Bottom Gradient Fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: 'linear-gradient(to top, #0a0a0f 0%, transparent 100%)' }}
        />
      </section>

      {/* Features Section */}
      <section
        ref={featureSectionRef}
        className="relative z-10 py-32 overflow-hidden bg-[#0a0a0f]/50 backdrop-blur-xl border-t border-white/5"
      >
        <div className="absolute inset-0 bg-[#0a0a0f]/80 pointer-events-none" />

        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.3), transparent)' }}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-8">
          <div className="text-center mb-20">
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8 transition-all duration-700 ${isFeatureVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
              <div className="w-2 h-2 rounded-full bg-[#A855F7] animate-pulse" />
              <span
                className="text-xs tracking-widest text-gray-400 uppercase"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Architecture
              </span>
            </div>

            <h2
              className={`text-4xl md:text-5xl lg:text-6xl font-light mb-6 transition-all duration-1000 ${isFeatureVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ fontFamily: 'var(--font-serif), serif' }}
            >
              <span className="text-white">The </span>
              <span className="italic text-[#A855F7]">Execution Kernel</span>
            </h2>

            <p className={`text-lg text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed transition-all duration-1000 delay-200 ${isFeatureVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              Four pillars powering verifiable autonomous agent execution
            </p>

            <div
              className={`w-24 h-px mx-auto transition-all duration-1000 delay-[400ms] ${isFeatureVisible ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'}`}
              style={{ background: 'linear-gradient(90deg, transparent, #A855F7, transparent)' }}
            />
          </div>

          {/* Cards grid -- glass-morphism with slide-in from alternating sides */}
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {features.map((feature, index) => {
              const slideDirection = index % 2 === 0 ? 'translate-x-[-40px]' : 'translate-x-[40px]';
              return (
                <div
                  key={feature.title}
                  className={`relative group transition-all duration-700 ${
                    isFeatureVisible
                      ? 'opacity-100 translate-x-0'
                      : `opacity-0 ${slideDirection}`
                  }`}
                  style={{ transitionDelay: `${500 + index * 150}ms` }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseMove={(e) => handleCardMouseMove(e, index)}
                  onMouseLeave={() => {
                    setHoveredIndex(null);
                    setSpotlights((prev) => {
                      const next = [...prev];
                      next[index] = { x: 50, y: 50 };
                      return next;
                    });
                  }}
                >
                  <Link href={feature.href} className="block">
                    <div className="relative min-h-[18rem] cursor-pointer">
                      {/* Glass-morphism base */}
                      <div
                        className="absolute inset-0 rounded-2xl backdrop-blur-md border transition-all duration-500"
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          borderColor: hoveredIndex === index ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                        }}
                      />

                      {/* Spotlight that follows cursor */}
                      <div
                        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                        style={{
                          background: `radial-gradient(circle at ${spotlights[index].x}% ${spotlights[index].y}%, rgba(168, 85, 247, 0.1), transparent 50%)`,
                        }}
                      />

                      {/* Number watermark */}
                      <div
                        className="absolute top-6 right-6 text-5xl font-extralight opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500 select-none"
                        style={{ color: '#A855F7', fontFamily: 'var(--font-mono), monospace' }}
                      >
                        {feature.number}
                      </div>

                      <div className="relative z-10 p-8 h-full flex flex-col">
                        <div className="mb-6">
                          <div className="relative inline-block">
                            <div className="absolute inset-0 rounded-xl blur-xl transition-all duration-500 opacity-0 group-hover:opacity-40 bg-[#A855F7]" />
                            <div
                              className="relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                              style={{
                                background: 'rgba(168, 85, 247, 0.1)',
                                border: '1px solid rgba(168, 85, 247, 0.2)',
                              }}
                            >
                              <feature.icon className="w-7 h-7" />
                            </div>
                          </div>
                        </div>

                        <h3 className="text-xl font-medium mb-3 text-white group-hover:text-[#A855F7] transition-colors duration-300">
                          {feature.title}
                        </h3>

                        <p className="text-gray-500 text-sm leading-relaxed flex-1 group-hover:text-gray-400 transition-colors duration-300">
                          {feature.description}
                        </p>

                        <div className="mt-4 flex items-center gap-3">
                          <div
                            className="h-px flex-1 rounded-full transition-all duration-500 origin-left scale-x-0 group-hover:scale-x-100"
                            style={{ background: 'linear-gradient(90deg, #A855F7, transparent)' }}
                          />
                        </div>
                      </div>

                      {/* Corner accents */}
                      <div className="absolute top-3 left-3 w-4 h-4 pointer-events-none">
                        <div className="absolute top-0 left-0 w-full h-px transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" style={{ background: 'rgba(168, 85, 247, 0.38)' }} />
                        <div className="absolute top-0 left-0 w-px h-full transform origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-300 delay-75" style={{ background: 'rgba(168, 85, 247, 0.38)' }} />
                      </div>
                      <div className="absolute bottom-3 right-3 w-4 h-4 pointer-events-none">
                        <div className="absolute bottom-0 right-0 w-full h-px transform origin-right scale-x-0 group-hover:scale-x-100 transition-transform duration-300 delay-150" style={{ background: 'rgba(168, 85, 247, 0.38)' }} />
                        <div className="absolute bottom-0 right-0 w-px h-full transform origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-300 delay-200" style={{ background: 'rgba(168, 85, 247, 0.38)' }} />
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works - Vertical Timeline */}
      <section
        ref={howItWorksSectionRef}
        className="relative z-10 py-32 overflow-hidden bg-[#0a0a0f]/50 backdrop-blur-xl border-t border-white/5"
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.2), transparent)' }}
        />

        <div className="relative z-10 max-w-3xl mx-auto px-8">
          <div className="text-center mb-20">
            <h2
              className={`text-4xl md:text-5xl font-light mb-6 transition-all duration-1000 ${isHowItWorksVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ fontFamily: 'var(--font-serif), serif' }}
            >
              <span className="text-white">How it </span>
              <span className="italic text-[#A855F7]">Works</span>
            </h2>
            <p className={`text-lg text-gray-400 max-w-xl mx-auto leading-relaxed transition-all duration-1000 delay-200 ${isHowItWorksVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              Four steps from registration to verified execution
            </p>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical glowing line */}
            <div
              className={`absolute left-6 md:left-8 top-0 bottom-0 w-px transition-all duration-1500 ${isHowItWorksVisible ? 'opacity-100' : 'opacity-0'}`}
              style={{
                background: 'linear-gradient(to bottom, transparent, #A855F7, #7C3AED, transparent)',
                boxShadow: '0 0 8px rgba(168, 85, 247, 0.3)',
              }}
            />

            <div className="space-y-12">
              {howItWorks.map((item, index) => (
                <div
                  key={item.step}
                  className={`relative flex items-start gap-6 md:gap-8 transition-all duration-700 ${isHowItWorksVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                  style={{ transitionDelay: `${400 + index * 200}ms` }}
                >
                  {/* Step number circle */}
                  <div className="relative z-10 shrink-0">
                    <div
                      className="w-12 h-12 md:w-16 md:h-16 rounded-full border flex items-center justify-center bg-[#0a0a0f]"
                      style={{
                        borderColor: 'rgba(168, 85, 247, 0.4)',
                        boxShadow: '0 0 15px rgba(168, 85, 247, 0.15)',
                      }}
                    >
                      <span
                        className="text-[#A855F7] text-sm md:text-base font-medium"
                        style={{ fontFamily: 'var(--font-mono), monospace' }}
                      >
                        {item.step}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="pt-2 md:pt-3">
                    <h3
                      className="text-lg md:text-xl font-medium text-white mb-2"
                      style={{ fontFamily: 'var(--font-serif), serif' }}
                    >
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trustless by Design */}
      <section className="relative z-10 flex flex-col items-center bg-[#0a0a0f]/50 backdrop-blur-xl border-t border-white/5 px-6 py-32 lg:px-12 overflow-hidden">
        <div className="text-center mb-16 max-w-3xl">
          <h2
            className="text-4xl md:text-5xl font-light mb-6"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            <span className="italic">Trustless</span> by Design
          </h2>
          <p className="text-lg text-white/50 leading-relaxed">
            Every action is cryptographically verified. No trust assumptions beyond math.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-7xl">
          {/* Card 1 — Deploy Verifiable Agents */}
          <StatCard
            title="Deploy Verifiable Agents"
            description="Compile ML models to deterministic RISC-V, generate cryptographic commitments, and register on-chain in minutes."
          >
            <div className="w-full h-72 rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-2 text-[10px] font-mono text-white/30 uppercase tracking-wider">terminal</span>
              </div>
              {/* Terminal content */}
              <div className="p-4 font-mono text-sm">
                <div className="flex items-center gap-2 text-white/50">
                  <span className="text-[#A855F7]">$</span>
                  <span>tal init my-agent --template yield</span>
                </div>
                <div className="mt-2 text-white/30">
                  <span className="text-green-400">&#10003;</span> Agent scaffolded successfully!
                </div>
                <div className="mt-2 flex items-center gap-2 text-white/50">
                  <span className="text-[#A855F7]">$</span>
                  <span>tal build --elf</span>
                </div>
                <div className="mt-1 text-white/30">
                  <span className="text-green-400">&#10003;</span> ELF binary built
                </div>
                <div className="mt-2 flex items-center gap-2 text-white/50">
                  <span className="text-[#A855F7]">$</span>
                  <span>tal deploy --testnet --hyperliquid</span>
                </div>
                <div className="mt-1 text-white/30">
                  <span className="text-green-400">&#10003;</span> Agent registered
                </div>
                <div className="mt-1 text-white/30">
                  <span className="text-green-400">&#10003;</span> Vault deployed
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[#A855F7]">&rarr;</span>
                  <span className="text-white/70">Vault:</span>
                  <span className="text-[#A855F7]">0x34E9...e2E4</span>
                </div>
              </div>
            </div>
          </StatCard>

          {/* Card 2 — Decentralized Execution (Featured) */}
          <StatCard
            title="Decentralized Execution"
            description="Executors run your agents off-chain and generate zero-knowledge proofs. No single point of failure."
            featured
          >
            <div className="group w-full h-80 rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden relative flex items-center justify-center">
              {/* Animated beam SVG */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0"
                viewBox="0 0 400 320"
                preserveAspectRatio="xMidYMid slice"
              >
                <defs>
                  <linearGradient id="beam-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="transparent"/>
                    <stop offset="50%" stopColor="rgba(168, 85, 247, 0.8)"/>
                    <stop offset="100%" stopColor="transparent"/>
                  </linearGradient>
                </defs>
                {/* Path 1 */}
                <path d="M420,40 C320,40 280,160 200,160" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
                <path d="M420,40 C320,40 280,160 200,160" fill="none" stroke="url(#beam-grad)" strokeWidth="1.5" strokeDasharray="100 1000" strokeLinecap="round">
                  <animate attributeName="stroke-dashoffset" from="1000" to="0" dur="3s" repeatCount="indefinite" />
                </path>
                {/* Path 2 */}
                <path d="M-20,280 C80,280 120,160 200,160" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
                <path d="M-20,280 C80,280 120,160 200,160" fill="none" stroke="url(#beam-grad)" strokeWidth="1.5" strokeDasharray="80 1000" strokeLinecap="round">
                  <animate attributeName="stroke-dashoffset" from="1000" to="0" dur="4s" repeatCount="indefinite" />
                </path>
              </svg>

              {/* Orbital Rings */}
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="absolute w-72 h-72 rounded-full border border-[#A855F7]/5 animate-[ping_4s_cubic-bezier(0,0,0.2,1)_infinite] opacity-10" />
                <div className="absolute w-60 h-60 rounded-full border border-white/5 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-20" style={{ animationDelay: '700ms' }} />
                <div className="absolute w-48 h-48 rounded-full border border-white/5 animate-[spin_40s_linear_infinite]" />
                <div className="absolute w-44 h-44 rounded-full border border-white/10 animate-[spin_30s_linear_infinite]" />
                <div className="absolute w-32 h-32 rounded-full border border-white/5 border-dashed animate-[spin_20s_linear_infinite_reverse]" />
                {/* Center Hub */}
                <div className="z-10 flex bg-[#0a0a0f] w-20 h-20 border-white/10 border rounded-3xl relative items-center justify-center overflow-hidden shadow-2xl group-hover:border-[#A855F7]/40 transition-colors duration-500">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-white relative z-20 group-hover:text-[#A855F7] transition-colors duration-500">
                    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
                    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>
                    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
                  </svg>
                  <div className="animate-[pulse_2s_infinite] bg-gradient-to-tr from-transparent via-[#A855F7]/10 to-transparent absolute inset-0 z-10" />
                </div>
              </div>

              {/* Status Badge */}
              <div className="absolute bottom-4 flex items-center">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A855F7] opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#A855F7]" />
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">Network Active</span>
                </div>
              </div>
            </div>
          </StatCard>

          {/* Card 3 — On-Chain Verification */}
          <StatCard
            title="On-Chain Verification"
            description="Proofs are verified on Ethereum for ~250k gas. Only valid, constraint-compliant actions settle."
          >
            <div className="w-full h-72 rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden relative flex flex-col items-center justify-center p-6">
              {/* ZK Proof hexagon visualization */}
              <div className="relative mb-6">
                <svg viewBox="0 0 100 100" className="w-24 h-24">
                  <defs>
                    <linearGradient id="proof-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#A855F7" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#A855F7" stopOpacity="0.2" />
                    </linearGradient>
                  </defs>
                  <polygon
                    points="50,5 90,25 90,75 50,95 10,75 10,25"
                    fill="none"
                    stroke="url(#proof-gradient)"
                    strokeWidth="2"
                  />
                  <polygon
                    points="50,20 75,35 75,65 50,80 25,65 25,35"
                    fill="none"
                    stroke="#A855F7"
                    strokeWidth="1"
                    opacity="0.5"
                  />
                  <circle cx="50" cy="50" r="8" fill="#A855F7" className="animate-[pulse_2s_infinite]" />
                </svg>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                <div className="relative">
                  <div className="absolute h-2 w-2 rounded-full bg-green-400 animate-ping opacity-75" />
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                </div>
                <span className="text-[10px] font-mono text-white/70 uppercase tracking-wider">Verified</span>
              </div>

              {/* Proof details */}
              <div className="mt-4 text-center">
                <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-1">Groth16 Proof</div>
                <div className="text-sm font-mono text-[#A855F7]">~200 bytes</div>
              </div>
            </div>
          </StatCard>
        </div>
      </section>
    </div>
  );
}
