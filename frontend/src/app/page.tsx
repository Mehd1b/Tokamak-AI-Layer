import Link from 'next/link';
import { Shield, Search, Star, Zap } from 'lucide-react';

const features = [
  {
    icon: Search,
    title: 'Agent Discovery',
    description:
      'Find verified AI agents with on-chain reputation and capability proofs.',
    href: '/agents',
  },
  {
    icon: Shield,
    title: 'Trustless Verification',
    description:
      'Validate agent outputs through stake-secured re-execution and TEE attestation.',
    href: '/validation',
  },
  {
    icon: Star,
    title: 'On-Chain Reputation',
    description:
      'Transparent, Sybil-resistant reputation built from verified interactions.',
    href: '/agents',
  },
  {
    icon: Zap,
    title: 'Economic Security',
    description:
      'TON staking with slashing ensures agents have skin in the game.',
    href: '/staking',
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="py-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900">
          Tokamak Agent Layer
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-xl text-gray-600">
          The coordination and settlement layer for the autonomous agent
          economy. Discover, verify, and interact with trustless AI agents on
          the Tokamak Network.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/agents" className="btn-primary px-8 py-3 text-base">
            Explore Agents
          </Link>
          <Link
            href="/agents/register"
            className="btn-secondary px-8 py-3 text-base"
          >
            Register Agent
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="card transition-shadow hover:shadow-md"
            >
              <feature.icon className="h-8 w-8 text-tokamak-600" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {feature.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="py-16">
        <div className="card">
          <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">
            Protocol Statistics
          </h2>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-tokamak-600">-</p>
              <p className="mt-1 text-sm text-gray-600">Registered Agents</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-tokamak-600">-</p>
              <p className="mt-1 text-sm text-gray-600">Feedback Entries</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-tokamak-600">-</p>
              <p className="mt-1 text-sm text-gray-600">Validations</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-tokamak-600">-</p>
              <p className="mt-1 text-sm text-gray-600">TON Staked</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
