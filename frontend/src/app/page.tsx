'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useReadContracts } from 'wagmi';
import { useAgentCount } from '@/hooks/useAgent';
import { useRecentTasks } from '@/hooks/useAgentRuntime';
import { useWallet } from '@/hooks/useWallet';
import { useWSTONBalance } from '@/hooks/useStaking';
import { CONTRACTS } from '@/lib/contracts';
import { formatBigInt } from '@/lib/utils';
import { TALValidationRegistryABI } from '../../../sdk/src/abi/TALValidationRegistry';
import AuroraBackground from '@/components/AuroraBackground';

/* ── Animated SVG Icons ── */

function DiscoveryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {/* Outer dashed orbit */}
      <circle
        cx="32" cy="32" r="28"
        stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.2"
        strokeDasharray="6 4"
        className="animate-spin-slower"
        style={{ transformOrigin: '32px 32px' }}
      />
      {/* Middle ring */}
      <circle cx="32" cy="32" r="20" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.3" />
      {/* Inner ring */}
      <circle cx="32" cy="32" r="12" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.5" />
      {/* Sonar sweep */}
      <circle cx="32" cy="32" r="8" fill="none" stroke="#38BDF8" strokeWidth="0.8" className="sonar-wave" />
      {/* Center dot */}
      <circle cx="32" cy="32" r="3" fill="#38BDF8" style={{ filter: 'drop-shadow(0 0 4px #38BDF8)' }} />
      {/* Data points */}
      <circle cx="20" cy="22" r="1.5" fill="#38BDF8" fillOpacity="0.6">
        <animate attributeName="fill-opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="44" cy="26" r="1.5" fill="#38BDF8" fillOpacity="0.4">
        <animate attributeName="fill-opacity" values="0.2;0.7;0.2" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="44" r="1.5" fill="#38BDF8" fillOpacity="0.5">
        <animate attributeName="fill-opacity" values="0.4;0.9;0.4" dur="1.8s" repeatCount="indefinite" />
      </circle>
      {/* Search lens handle */}
      <line x1="42" y1="42" x2="52" y2="52" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {/* Outer hexagonal shield */}
      <path
        d="M32 4 L56 18 V42 L32 60 L8 42 V18 Z"
        stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.25"
        strokeDasharray="8 4"
      />
      {/* Inner hexagonal shield */}
      <path
        d="M32 12 L50 22 V40 L32 52 L14 40 V22 Z"
        stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.5"
        fill="rgba(56, 189, 248, 0.03)"
      />
      {/* Checkmark */}
      <path
        d="M22 32 L29 39 L42 24"
        stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 3px #38BDF8)' }}
      />
      {/* Orbiting dot top-right */}
      <circle cx="0" cy="0" r="2" fill="#38BDF8" fillOpacity="0.6">
        <animateMotion dur="4s" repeatCount="indefinite" path="M32,4 L56,18 V42 L32,60 L8,42 V18 Z" />
      </circle>
      {/* Corner accents */}
      <circle cx="32" cy="4" r="1.5" fill="#38BDF8" fillOpacity="0.4" />
      <circle cx="56" cy="18" r="1.5" fill="#38BDF8" fillOpacity="0.3" />
      <circle cx="8" cy="18" r="1.5" fill="#38BDF8" fillOpacity="0.3" />
    </svg>
  );
}

function ReputationIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {/* Outer pulsing ring */}
      <circle
        cx="32" cy="32" r="28"
        stroke="#38BDF8" strokeWidth="0.8" strokeOpacity="0.15"
      >
        <animate attributeName="r" values="26;30;26" dur="3s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.15;0.3;0.15" dur="3s" repeatCount="indefinite" />
      </circle>
      {/* Middle ring with dashes */}
      <circle
        cx="32" cy="32" r="22"
        stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.3"
        strokeDasharray="3 5"
        className="animate-spin-slow"
        style={{ transformOrigin: '32px 32px' }}
      />
      {/* Star shape */}
      <path
        d="M32 12 L36.5 24.5 L50 24.5 L39 32.5 L43 46 L32 38 L21 46 L25 32.5 L14 24.5 L27.5 24.5 Z"
        stroke="#38BDF8" strokeWidth="1.5" strokeLinejoin="round"
        fill="rgba(56, 189, 248, 0.08)"
        style={{ filter: 'drop-shadow(0 0 4px rgba(56,189,248,0.3))' }}
      />
      {/* Inner glow dot */}
      <circle cx="32" cy="30" r="3" fill="#38BDF8" fillOpacity="0.4">
        <animate attributeName="fill-opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Floating score indicators */}
      <rect x="48" y="14" width="6" height="2" rx="1" fill="#38BDF8" fillOpacity="0.4" />
      <rect x="50" y="18" width="4" height="2" rx="1" fill="#38BDF8" fillOpacity="0.3" />
      <rect x="49" y="22" width="5" height="2" rx="1" fill="#38BDF8" fillOpacity="0.2" />
    </svg>
  );
}

function SecurityIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {/* Energy rings */}
      <ellipse
        cx="32" cy="32" rx="26" ry="10"
        stroke="#38BDF8" strokeWidth="0.8" strokeOpacity="0.2"
        strokeDasharray="4 6"
        className="animate-spin-slow"
        style={{ transformOrigin: '32px 32px' }}
      />
      <ellipse
        cx="32" cy="32" rx="10" ry="26"
        stroke="#38BDF8" strokeWidth="0.8" strokeOpacity="0.2"
        strokeDasharray="4 6"
        className="animate-spin-slower"
        style={{ transformOrigin: '32px 32px' }}
      />
      {/* Bolt shape */}
      <path
        d="M35 8 L22 34 H30 L27 56 L44 28 H34 Z"
        stroke="#38BDF8" strokeWidth="1.5" strokeLinejoin="round"
        fill="rgba(56, 189, 248, 0.1)"
        style={{ filter: 'drop-shadow(0 0 6px rgba(56,189,248,0.4))' }}
      />
      {/* Core glow */}
      <circle cx="32" cy="32" r="6" fill="#38BDF8" fillOpacity="0.08">
        <animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="fill-opacity" values="0.05;0.15;0.05" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Particle dots */}
      <circle cx="14" cy="20" r="1" fill="#38BDF8" fillOpacity="0.5">
        <animate attributeName="cy" values="20;18;20" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="44" r="1" fill="#38BDF8" fillOpacity="0.4">
        <animate attributeName="cy" values="44;42;44" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="48" cy="16" r="1" fill="#38BDF8" fillOpacity="0.3">
        <animate attributeName="cy" values="16;14;16" dur="1.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* ── Stat Card (Trustless by Design style) ── */

function StatCard({ title, description, children, featured = false }: {
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
      <div className="absolute inset-0 rounded-[32px] border border-[#38BDF8]/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-50 pointer-events-none" />
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

const features = [
  {
    icon: DiscoveryIcon,
    title: 'Agent Discovery',
    description:
      'Find verified AI agents with on-chain reputation and capability proofs.',
    href: '/agents',
    number: '01',
  },
  {
    icon: ShieldIcon,
    title: 'Trustless Verification',
    description:
      'Validate agent outputs through stake-secured re-execution and TEE attestation.',
    href: '/validation',
    number: '02',
  },
  {
    icon: ReputationIcon,
    title: 'On-Chain Reputation',
    description:
      'Transparent, Sybil-resistant reputation built from verified interactions.',
    href: '/agents',
    number: '03',
  },
  {
    icon: SecurityIcon,
    title: 'Economic Security',
    description:
      'TON staking with slashing ensures agents have skin in the game.',
    href: '/staking',
    number: '04',
  },
];

interface CardState {
  rotateX: number;
  rotateY: number;
  spotlightX: number;
  spotlightY: number;
}

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const { count: agentCount } = useAgentCount();
  const { tasks } = useRecentTasks();
  const { address, isConnected } = useWallet();
  const { data: stakeBalance } = useWSTONBalance(address);

  // Foundation cards state
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [isSectionVisible, setIsSectionVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [cardStates, setCardStates] = useState<CardState[]>(
    features.map(() => ({ rotateX: 0, rotateY: 0, spotlightX: 50, spotlightY: 50 }))
  );

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setIsSectionVisible(true);
        });
      },
      { threshold: 0.15 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const handleCardMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>, index: number) => {
    const card = cardRefs.current[index];
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rotateY = ((e.clientX - centerX) / (rect.width / 2)) * 8;
    const rotateX = -((e.clientY - centerY) / (rect.height / 2)) * 8;
    const spotlightX = ((e.clientX - rect.left) / rect.width) * 100;
    const spotlightY = ((e.clientY - rect.top) / rect.height) * 100;
    setCardStates((prev) => {
      const next = [...prev];
      next[index] = { rotateX, rotateY, spotlightX, spotlightY };
      return next;
    });
  }, []);

  const handleCardMouseLeave = useCallback((index: number) => {
    setHoveredIndex(null);
    setCardStates((prev) => {
      const next = [...prev];
      next[index] = { rotateX: 0, rotateY: 0, spotlightX: 50, spotlightY: 50 };
      return next;
    });
  }, []);

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const agentCountNum = agentCount ? Number(agentCount) : 0;

  const validationContracts = Array.from(
    { length: Math.min(agentCountNum, 20) },
    (_, i) => ({
      address: CONTRACTS.validationRegistry as `0x${string}`,
      abi: TALValidationRegistryABI,
      functionName: 'getAgentValidations' as const,
      args: [BigInt(i + 1)],
    })
  );

  const { data: validationData } = useReadContracts({
    contracts: validationContracts,
    query: { enabled: agentCountNum > 0 },
  });

  const totalValidations = validationData
    ? validationData.reduce((sum, result) => {
        if (result.status === 'success' && Array.isArray(result.result)) {
          return sum + result.result.length;
        }
        return sum;
      }, 0)
    : 0;

  return (
    <div>
      {/* Aurora Background - Landing page only */}
      <AuroraBackground />

      {/* Hero Section - Split Layout */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Aurora fade overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-[2]"
          style={{
            background: 'linear-gradient(to right, transparent 0%, transparent 35%, rgba(10,10,15,0.95) 55%, #0a0a0f 65%)'
          }}
        />

        {/* Dot Pattern Overlay - Right Side */}
        <div
          className="absolute top-0 right-0 w-1/2 h-full pointer-events-none z-[3]"
          style={{
            backgroundImage: 'radial-gradient(rgb(255, 255, 255) 0.5px, transparent 0.5px)',
            backgroundSize: '18px 18px',
            opacity: 0.2,
            maskImage: 'linear-gradient(to left, rgba(0,0,0,0.4) 0%, transparent 60%)'
          }}
        />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-12 flex flex-col lg:flex-row items-center justify-between gap-12 pt-32 pb-20 lg:py-20">
          {/* Left Side - Text Content */}
          <div className="flex-1 max-w-2xl text-center lg:text-left">
            {/* Eyebrow */}
            <span
              className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-8 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              ERC-8004 Compliant &bull; Tokamak L2
            </span>

            {/* Main Heading - Playfair Display */}
            <h1
              className={`text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-light leading-tight mb-6 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{
                fontFamily: 'var(--font-serif), serif',
                transitionDelay: '200ms'
              }}
            >
              <span className="block text-white">
                <span className="italic">Trustless</span> Agent
              </span>
              <span className="block mt-2">
                <span
                  className="italic"
                  style={{
                    background: 'linear-gradient(90deg, #00d4ff, #38bdf8)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Layer
                </span>
              </span>
            </h1>

            {/* Subtitle */}
            <p
              className={`text-lg md:text-xl text-gray-400 max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ transitionDelay: '600ms', fontFamily: 'var(--font-mono), monospace' }}
            >
              The coordination and settlement layer for the autonomous agent economy.
              Discover, verify, and interact with{' '}
              <span className="text-[#38BDF8]">trustless AI agents</span> on Tokamak Network.
            </p>

            {/* CTA Buttons */}
            <div
              className={`flex flex-wrap justify-center lg:justify-start gap-4 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ transitionDelay: '800ms' }}
            >
              <Link
                href="/agents"
                className="shiny-cta group"
              >
                <span className="shiny-cta-text">
                  Explore Agents
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

              <Link
                href="/agents/register"
                className="px-8 py-4 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all duration-300"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Register Agent
              </Link>
            </div>
          </div>

          {/* Right Side - Radar Visualization - Hidden on mobile */}
          <div
            className={`hidden lg:flex flex-1 justify-center lg:justify-end transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
            style={{ transitionDelay: '400ms' }}
          >
            <div className="relative w-[450px] h-[550px] md:w-[600px] md:h-[700px]">
              {/* Glow behind radar */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[500px] md:h-[500px] rounded-full pointer-events-none animate-breathe"
                style={{
                  background: 'radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, rgba(56, 189, 248, 0.08) 50%, transparent 70%)'
                }}
              />

              <svg viewBox="0 0 600 600" className="w-full h-full">
                <defs>
                  <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="beam-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
                    <stop offset="50%" stopColor="#38BDF8" stopOpacity="1" />
                    <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Pulsing Glow */}
                <circle cx="300" cy="300" r="120" fill="url(#center-glow)" />

                {/* Sonar Waves */}
                {[0, 1, 2].map((i) => (
                  <circle
                    key={`sonar-${i}`}
                    cx="300" cy="300" r="10"
                    fill="none" stroke="#38BDF8" strokeWidth="1"
                    className="sonar-wave"
                    style={{ animationDelay: `${i}s` }}
                  />
                ))}

                {/* Outer Dashed Orbit */}
                <circle
                  cx="300" cy="300" r="160"
                  fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="1"
                  strokeDasharray="10 20"
                  className="animate-spin-slow"
                  style={{ transformOrigin: '300px 300px' }}
                />

                {/* Inner Dashed Orbit */}
                <circle
                  cx="300" cy="300" r="110"
                  fill="none" stroke="#38BDF8" strokeOpacity="0.2" strokeWidth="1"
                  strokeDasharray="4 6"
                  className="animate-spin-slower"
                  style={{ transformOrigin: '300px 300px' }}
                />

                {/* Bezier Lines - Upper Left */}
                <path d="M 50 200 C 150 200, 200 300, 300 300" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
                <path d="M 50 200 C 150 200, 200 300, 300 300" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="80 320" strokeDashoffset="320" opacity="0">
                  <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="0s" fill="freeze" />
                  <animate attributeName="stroke-dashoffset" from="320" to="-80" dur="3s" repeatCount="indefinite" calcMode="linear" />
                </path>

                {/* Bezier Lines - Lower Left */}
                <path d="M 50 400 C 150 400, 200 300, 300 300" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
                <path d="M 50 400 C 150 400, 200 300, 300 300" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="80 320" strokeDashoffset="320" opacity="0">
                  <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="1.5s" fill="freeze" />
                  <animate attributeName="stroke-dashoffset" from="320" to="-80" dur="3s" begin="1.5s" repeatCount="indefinite" calcMode="linear" />
                </path>

                {/* Bezier Lines - Upper Right */}
                <path d="M 550 200 C 450 200, 400 300, 300 300" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
                <path d="M 550 200 C 450 200, 400 300, 300 300" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="60 320" strokeDashoffset="320" opacity="0">
                  <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="0.75s" fill="freeze" />
                  <animate attributeName="stroke-dashoffset" from="320" to="-60" dur="3s" begin="0.75s" repeatCount="indefinite" calcMode="linear" />
                </path>

                {/* Bezier Lines - Lower Right */}
                <path d="M 550 400 C 450 400, 400 300, 300 300" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
                <path d="M 550 400 C 450 400, 400 300, 300 300" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="60 320" strokeDashoffset="320" opacity="0">
                  <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="2.25s" fill="freeze" />
                  <animate attributeName="stroke-dashoffset" from="320" to="-60" dur="3s" begin="2.25s" repeatCount="indefinite" calcMode="linear" />
                </path>

                {/* Center Focal Point */}
                <circle cx="300" cy="300" r="8" fill="#0A0A0A" stroke="#38BDF8" strokeWidth="2" />
                <circle cx="300" cy="300" r="4" fill="#38BDF8" style={{ filter: 'drop-shadow(0 0 6px #38BDF8)' }} />

                {/* Data Points */}
                <circle cx="200" cy="220" r="2" fill="#38BDF8" fillOpacity="0.6" />
                <circle cx="380" cy="180" r="1.5" fill="#38BDF8" fillOpacity="0.4" />
                <circle cx="420" cy="350" r="2" fill="#38BDF8" fillOpacity="0.5" />
                <circle cx="180" cy="380" r="1.5" fill="#38BDF8" fillOpacity="0.3" />
                <circle cx="350" cy="420" r="2" fill="#38BDF8" fillOpacity="0.4" />
                <circle cx="240" cy="160" r="1.5" fill="#38BDF8" fillOpacity="0.5" />

                {/* TRUSTLESS Label */}
                <g transform="translate(80, 120)">
                  <text fill="#38BDF8" fontSize="12" letterSpacing="1.2" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                    TRUSTLESS
                  </text>
                  <line x1="0" y1="16" x2="78" y2="16" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.5" />
                </g>

                {/* ON-CHAIN Label */}
                <g transform="translate(420, 480)">
                  <text fill="#38BDF8" fontSize="12" letterSpacing="1.2" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                    ON-CHAIN
                  </text>
                  <line x1="0" y1="16" x2="72" y2="16" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.5" />
                </g>

                {/* Status Indicators */}
                <g transform="translate(520, 300)">
                  <rect x="0" y="0" width="4" height="4" fill="rgba(255,255,255,0.2)" />
                  <rect x="8" y="0" width="4" height="4" fill="rgba(255,255,255,0.2)" />
                  <rect x="16" y="0" width="4" height="4" fill="#38BDF8" className="animate-pulse" />
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

      {/* Foundation Section - Blurred Aurora BG + 3D Cards */}
      <section
        ref={sectionRef}
        className="relative z-10 py-32 overflow-hidden bg-[#0a0a0f]/50 backdrop-blur-xl border-t border-white/5"
      >
        {/* Semi-transparent overlay to darken aurora behind */}
        <div className="absolute inset-0 bg-[#0a0a0f]/80 pointer-events-none" />

        {/* Top gradient line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.3), transparent)' }}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-8">
          {/* Section header */}
          <div className="text-center mb-20">
            {/* Label badge */}
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8 transition-all duration-700 ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
              <div className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
              <span
                className="text-xs tracking-widest text-gray-400 uppercase"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Foundation
              </span>
            </div>

            {/* Main heading */}
            <h2
              className={`text-4xl md:text-5xl lg:text-6xl font-light mb-6 transition-all duration-1000 ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ fontFamily: 'var(--font-serif), serif' }}
            >
              <span className="text-white">The </span>
              <span className="italic text-[#38BDF8]">Trustless Agent</span>
              <span className="text-white"> Economy</span>
            </h2>

            <p className={`text-lg text-gray-400 max-w-2xl mx-auto mb-8 transition-all duration-1000 delay-200 ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              Four pillars powering autonomous AI agent coordination
            </p>

            {/* Decorative line */}
            <div
              className={`w-24 h-px mx-auto transition-all duration-1000 delay-[400ms] ${isSectionVisible ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'}`}
              style={{ background: 'linear-gradient(90deg, transparent, #38BDF8, transparent)' }}
            />
          </div>

          {/* Cards grid */}
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                ref={(el) => { cardRefs.current[index] = el; }}
                className={`relative group transition-all duration-700 ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{ transitionDelay: `${500 + index * 150}ms`, perspective: '1000px' }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseMove={(e) => handleCardMouseMove(e, index)}
                onMouseLeave={() => handleCardMouseLeave(index)}
              >
                <Link href={feature.href} className="block">
                  <div
                    className="relative h-72 transition-transform duration-200 ease-out cursor-pointer"
                    style={{
                      transform: `rotateX(${cardStates[index].rotateX}deg) rotateY(${cardStates[index].rotateY}deg)`,
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    {/* Card background */}
                    <div
                      className="absolute inset-0 rounded-2xl border transition-all duration-500"
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderColor: hoveredIndex === index ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                      }}
                    />

                    {/* Cursor spotlight */}
                    <div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                      style={{
                        background: `radial-gradient(circle at ${cardStates[index].spotlightX}% ${cardStates[index].spotlightY}%, rgba(56, 189, 248, 0.08), transparent 50%)`,
                      }}
                    />

                    {/* Number indicator */}
                    <div
                      className="absolute top-6 right-6 text-5xl font-extralight opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500 select-none"
                      style={{ color: '#38BDF8', fontFamily: 'var(--font-mono), monospace' }}
                    >
                      {feature.number}
                    </div>

                    {/* Content */}
                    <div className="relative z-10 p-8 h-full flex flex-col">
                      {/* Icon */}
                      <div className="mb-6">
                        <div className="relative inline-block">
                          {/* Icon glow */}
                          <div className="absolute inset-0 rounded-xl blur-xl transition-all duration-500 opacity-0 group-hover:opacity-40 bg-[#38BDF8]" />
                          {/* Icon container */}
                          <div
                            className="relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                            style={{
                              background: 'rgba(56, 189, 248, 0.1)',
                              border: '1px solid rgba(56, 189, 248, 0.2)',
                            }}
                          >
                            <feature.icon className="w-7 h-7" />
                          </div>
                          {/* Orbital ring on hover */}
                          <div
                            className="absolute -inset-2 rounded-full border border-dashed opacity-0 group-hover:opacity-20 transition-opacity duration-500"
                            style={{
                              borderColor: '#38BDF8',
                              animation: hoveredIndex === index ? 'spin 15s linear infinite' : 'none',
                            }}
                          />
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-xl font-medium mb-3 text-white group-hover:text-[#38BDF8] transition-colors duration-300">
                        {feature.title}
                      </h3>

                      {/* Description */}
                      <p className="text-gray-500 text-sm leading-relaxed flex-1 group-hover:text-gray-400 transition-colors duration-300">
                        {feature.description}
                      </p>

                      {/* Bottom indicator line */}
                      <div className="mt-4 flex items-center gap-3">
                        <div
                          className="h-px flex-1 rounded-full transition-all duration-500 origin-left scale-x-0 group-hover:scale-x-100"
                          style={{ background: 'linear-gradient(90deg, #38BDF8, transparent)' }}
                        />
                      </div>
                    </div>

                    {/* Corner accents - top left */}
                    <div className="absolute top-3 left-3 w-4 h-4 pointer-events-none">
                      <div
                        className="absolute top-0 left-0 w-full h-px transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
                        style={{ background: 'rgba(56, 189, 248, 0.38)' }}
                      />
                      <div
                        className="absolute top-0 left-0 w-px h-full transform origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-300 delay-75"
                        style={{ background: 'rgba(56, 189, 248, 0.38)' }}
                      />
                    </div>

                    {/* Corner accents - bottom right */}
                    <div className="absolute bottom-3 right-3 w-4 h-4 pointer-events-none">
                      <div
                        className="absolute bottom-0 right-0 w-full h-px transform origin-right scale-x-0 group-hover:scale-x-100 transition-transform duration-300 delay-150"
                        style={{ background: 'rgba(56, 189, 248, 0.38)' }}
                      />
                      <div
                        className="absolute bottom-0 right-0 w-px h-full transform origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-300 delay-200"
                        style={{ background: 'rgba(56, 189, 248, 0.38)' }}
                      />
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Protocol Statistics - Trustless by Design Style */}
      <section className="relative z-10 flex flex-col items-center bg-[#0a0a0f]/50 backdrop-blur-xl border-t border-white/5 px-6 py-32 lg:px-12 overflow-hidden">
        {/* Section header */}
        <div className="text-center mb-16 max-w-3xl">
          <h2
            className="text-4xl md:text-5xl font-light mb-6"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            <span className="italic">Protocol</span> Statistics
          </h2>
          <p
            className="text-lg text-white/50 leading-relaxed"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            Real-time metrics from the Tokamak Agent Layer on-chain registry.
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-7xl">
          {/* Card 1 - Agents */}
          <StatCard
            title="Agent Registry"
            description="ERC-721 identity NFTs with on-chain reputation and ZK commitments."
          >
            {/* Nodes visualization */}
            <div className="w-full h-72 rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden relative flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-40 h-40">
                {/* Central node */}
                <circle cx="100" cy="100" r="14" fill="none" stroke="#38BDF8" strokeWidth="1.5" />
                <circle cx="100" cy="100" r="6" fill="#38BDF8" style={{ filter: 'drop-shadow(0 0 6px #38BDF8)' }} />
                {/* Orbiting ring */}
                <circle cx="100" cy="100" r="50" fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="6 8" className="animate-spin-slow" style={{ transformOrigin: '100px 100px' }} />
                <circle cx="100" cy="100" r="75" fill="none" stroke="white" strokeOpacity="0.05" strokeWidth="1" strokeDasharray="3 6" className="animate-spin-slower" style={{ transformOrigin: '100px 100px' }} />
                {/* Satellite nodes */}
                {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                  const rad = (angle * Math.PI) / 180;
                  const cx = 100 + Math.cos(rad) * 50;
                  const cy = 100 + Math.sin(rad) * 50;
                  return (
                    <g key={`node-${i}`}>
                      <line x1="100" y1="100" x2={cx} y2={cy} stroke="#38BDF8" strokeWidth="0.5" strokeOpacity="0.2" />
                      <circle cx={cx} cy={cy} r="4" fill="none" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.4" />
                      <circle cx={cx} cy={cy} r="1.5" fill="#38BDF8" fillOpacity={0.3 + i * 0.1} />
                    </g>
                  );
                })}
              </svg>
              {/* Stat overlay */}
              <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center">
                <span
                  className="text-3xl font-light text-[#38BDF8]"
                  style={{ fontFamily: 'var(--font-mono), monospace', filter: 'drop-shadow(0 0 8px rgba(56,189,248,0.4))' }}
                >
                  {agentCount !== undefined ? agentCount.toString() : '-'}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 mt-1">Registered Agents</span>
              </div>
            </div>
          </StatCard>

          {/* Card 2 - Validations (Featured) */}
          <StatCard
            title="Validation Engine"
            description="Stake-secured re-execution with DRB-selected validators and bounty distribution."
            featured
          >
            {/* Orbital rings visualization */}
            <div className="group w-full h-80 rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden relative flex items-center justify-center">
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Ping rings */}
                <div className="absolute w-72 h-72 rounded-full border border-[#38BDF8]/5 animate-[ping_4s_cubic-bezier(0,0,0.2,1)_infinite] opacity-10" />
                <div className="absolute w-60 h-60 rounded-full border border-white/5 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-20" style={{ animationDelay: '700ms' }} />
                {/* Spinning rings */}
                <div className="absolute w-48 h-48 rounded-full border border-white/5 animate-[spin_40s_linear_infinite]" />
                <div className="absolute w-44 h-44 rounded-full border border-white/10 animate-[spin_30s_linear_infinite]" />
                <div className="absolute w-32 h-32 rounded-full border border-white/5 border-dashed animate-[spin_20s_linear_infinite_reverse]" />
                {/* Center hub */}
                <div className="z-10 flex flex-col items-center justify-center bg-[#0a0a0f] w-24 h-24 border-white/10 border rounded-3xl relative overflow-hidden shadow-2xl group-hover:border-[#38BDF8]/40 transition-colors duration-500">
                  <span
                    className="text-2xl font-light text-[#38BDF8] relative z-20"
                    style={{ fontFamily: 'var(--font-mono), monospace', filter: 'drop-shadow(0 0 8px rgba(56,189,248,0.4))' }}
                  >
                    {totalValidations > 0 ? totalValidations.toString() : agentCountNum > 0 ? '0' : '-'}
                  </span>
                  <span className="text-[8px] font-mono uppercase tracking-wider text-white/40 relative z-20 mt-0.5">Validations</span>
                  <div className="animate-[pulse_2s_infinite] bg-gradient-to-tr from-transparent via-[#38BDF8]/10 to-transparent absolute inset-0 z-10" />
                </div>
              </div>
              {/* Bottom stat row */}
              <div className="absolute bottom-4 flex items-center gap-6">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38BDF8] opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#38BDF8]" />
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                    {completedTasks > 0 ? `${completedTasks} Tasks` : 'Awaiting Tasks'}
                  </span>
                </div>
              </div>
            </div>
          </StatCard>

          {/* Card 3 - Staking */}
          <StatCard
            title="Economic Security"
            description="TON staking with slashing conditions ensures validators have skin in the game."
          >
            {/* Staking hexagon proof visualization */}
            <div className="w-full h-72 rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden relative flex flex-col items-center justify-center p-6">
              <div className="relative mb-6">
                <svg viewBox="0 0 100 100" className="w-24 h-24">
                  <defs>
                    <linearGradient id="stake-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.2" />
                    </linearGradient>
                  </defs>
                  <polygon points="50,5 90,25 90,75 50,95 10,75 10,25" fill="none" stroke="url(#stake-gradient)" strokeWidth="2" />
                  <polygon points="50,20 75,35 75,65 50,80 25,65 25,35" fill="none" stroke="#38BDF8" strokeWidth="1" opacity="0.5" />
                  <circle cx="50" cy="50" r="8" fill="#38BDF8" className="animate-[pulse_2s_infinite]" />
                  {/* TON symbol */}
                  <text x="50" y="54" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" style={{ fontFamily: 'var(--font-mono), monospace' }}>T</text>
                </svg>
              </div>
              {/* Stat value */}
              <span
                className="text-3xl font-light text-[#38BDF8]"
                style={{ fontFamily: 'var(--font-mono), monospace', filter: 'drop-shadow(0 0 8px rgba(56,189,248,0.4))' }}
              >
                {isConnected && stakeBalance ? formatBigInt(stakeBalance, 27) : '-'}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 mt-2">
                {isConnected ? 'Your TON Staked' : 'TON Staked'}
              </span>
              {/* Status badge */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5 mt-4">
                <div className="relative">
                  <div className="absolute h-2 w-2 rounded-full bg-green-400 animate-ping opacity-75" />
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                </div>
                <span className="text-[10px] font-mono text-white/70 uppercase tracking-wider">Secured</span>
              </div>
            </div>
          </StatCard>
        </div>
      </section>

      {/* Recent Tasks */}
      {tasks.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 lg:px-12 pb-24">
          <div className="terminal">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#ef4444' }} />
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#eab308' }} />
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#22c55e' }} />
            </div>
            <h2 className="mb-6 text-xl font-bold text-white">
              Recent Agent Activity
            </h2>
            <div className="space-y-3">
              {tasks.slice(0, 5).map((task) => (
                <div
                  key={task.taskId}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-2 w-2 rounded-full ${
                        task.status === 'completed'
                          ? 'bg-[#38BDF8]'
                          : task.status === 'failed'
                            ? 'bg-red-400'
                            : 'bg-amber-400'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-white">
                        {task.agentId === 'summarizer'
                          ? 'Text Summarization'
                          : task.agentId === 'auditor'
                            ? 'Solidity Audit'
                            : task.agentId}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(task.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        task.status === 'completed'
                          ? 'bg-[#38BDF8]/10 text-[#38BDF8]'
                          : task.status === 'failed'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {task.status}
                    </span>
                    <span className="font-mono text-xs text-zinc-600">
                      {task.taskId.slice(0, 8)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
