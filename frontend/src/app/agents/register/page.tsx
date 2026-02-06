'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, Plus, X } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';

interface Capability {
  id: string;
  name: string;
  description: string;
}

export default function RegisterAgentPage() {
  const { isConnected, isCorrectChain } = useWallet();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [services, setServices] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [newServiceType, setNewServiceType] = useState('A2A');
  const [newServiceUrl, setNewServiceUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addService = () => {
    if (newServiceType && newServiceUrl) {
      setServices((prev) => ({ ...prev, [newServiceType]: newServiceUrl }));
      setNewServiceUrl('');
    }
  };

  const removeService = (key: string) => {
    setServices((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const addCapability = () => {
    setCapabilities((prev) => [
      ...prev,
      { id: `cap-${Date.now()}`, name: '', description: '' },
    ]);
  };

  const updateCapability = (
    index: number,
    field: keyof Capability,
    value: string,
  ) => {
    setCapabilities((prev) =>
      prev.map((cap, i) => (i === index ? { ...cap, [field]: value } : cap)),
    );
  };

  const removeCapability = (index: number) => {
    setCapabilities((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !description) return;

    setIsSubmitting(true);
    try {
      // Build registration file
      const registration = {
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name,
        description,
        image: imageUrl || undefined,
        active: true,
        services: Object.keys(services).length > 0 ? services : undefined,
        tal: capabilities.length > 0 ? { capabilities } : undefined,
      };

      // TODO: Upload to IPFS and call contract
      console.log('Registration file:', registration);
      alert('Registration flow requires wallet connection and IPFS upload. Registration file prepared.');
    } catch (error) {
      console.error('Registration failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/agents"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </Link>

      <h1 className="mb-2 text-3xl font-bold text-gray-900">Register Agent</h1>
      <p className="mb-8 text-gray-600">
        Register your AI agent on the Tokamak Agent Layer. Your agent will
        receive an ERC-721 token representing its on-chain identity.
      </p>

      {!isConnected && (
        <div className="card mb-6 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Please connect your wallet to register an agent.
          </p>
        </div>
      )}

      {isConnected && !isCorrectChain && (
        <div className="card mb-6 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Please switch to Optimism Sepolia network.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Basic Information
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Agent Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="My AI Agent"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={3}
                placeholder="Describe what your agent does..."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Image URL
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/agent-avatar.png"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500"
              />
            </div>
          </div>
        </div>

        {/* Service Endpoints */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Service Endpoints
          </h2>

          {Object.entries(services).length > 0 && (
            <div className="mb-4 space-y-2">
              {Object.entries(services).map(([type, url]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      {type}:
                    </span>{' '}
                    <span className="text-sm text-gray-600">{url}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeService(type)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <select
              value={newServiceType}
              onChange={(e) => setNewServiceType(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="A2A">A2A</option>
              <option value="MCP">MCP</option>
              <option value="OASF">OASF</option>
              <option value="web">Web</option>
              <option value="email">Email</option>
              <option value="DID">DID</option>
            </select>
            <input
              type="text"
              value={newServiceUrl}
              onChange={(e) => setNewServiceUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={addService}
              className="btn-secondary"
            >
              Add
            </button>
          </div>
        </div>

        {/* Capabilities */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Capabilities
            </h2>
            <button
              type="button"
              onClick={addCapability}
              className="btn-secondary flex items-center gap-1 text-xs"
            >
              <Plus className="h-3 w-3" /> Add Capability
            </button>
          </div>

          <div className="space-y-4">
            {capabilities.map((cap, i) => (
              <div key={cap.id} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeCapability(i)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={cap.name}
                    onChange={(e) => updateCapability(i, 'name', e.target.value)}
                    placeholder="Capability name"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={cap.description}
                    onChange={(e) =>
                      updateCapability(i, 'description', e.target.value)
                    }
                    placeholder="Description"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ))}

            {capabilities.length === 0 && (
              <p className="text-center text-sm text-gray-500">
                No capabilities added yet.
              </p>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link href="/agents" className="btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!isConnected || !isCorrectChain || isSubmitting || !name || !description}
            className="btn-primary flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            {isSubmitting ? 'Registering...' : 'Register Agent'}
          </button>
        </div>
      </form>
    </div>
  );
}
