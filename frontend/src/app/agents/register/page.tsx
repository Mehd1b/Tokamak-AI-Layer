'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, Plus, X, Info, Shield } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useRegisterAgent, useRegisterAgentV2 } from '@/hooks/useRegisterAgent';
import { useSetAgentFee } from '@/hooks/useTaskFee';
import { parseEther } from 'viem';
import { shortenAddress } from '@/lib/utils';

interface Capability {
  id: string;
  name: string;
  description: string;
  placeholder: string;
}

const VALIDATION_MODELS = [
  { value: 0, label: 'Reputation Only', description: 'Lightweight feedback-based trust. No operators required.' },
  { value: 1, label: 'Stake Secured', description: 'DRB-selected validator re-execution with stake collateral. Requires operators with sufficient stake.' },
  { value: 2, label: 'Hybrid', description: 'Combines stake security with additional verification. Requires operators with sufficient stake.' },
];

export default function RegisterAgentPage() {
  const router = useRouter();
  const { address, isConnected, isCorrectChain: isL2 } = useWallet();
  const { register, hash: txHash, isPending, isConfirming, isSuccess, error: txError, newAgentId } = useRegisterAgent();
  const { registerV2, hash: txHashV2, isPending: isPendingV2, isSigning, isConfirming: isConfirmingV2, isSuccess: isSuccessV2, error: txErrorV2, newAgentId: newAgentIdV2 } = useRegisterAgentV2();
  const { setFee, hash: feeHash, isPending: isFeePending, isConfirming: isFeeConfirming, isSuccess: isFeeSuccess, error: feeError } = useSetAgentFee();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [feePerTask, setFeePerTask] = useState('');
  const [validationModel, setValidationModel] = useState(0);
  const [selfAsOperator, setSelfAsOperator] = useState(true);
  const [services, setServices] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [requestExample, setRequestExample] = useState('');
  const [newServiceType, setNewServiceType] = useState('A2A');
  const [newServiceUrl, setNewServiceUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ipfsUri, setIpfsUri] = useState<string | null>(null);

  // Determine which registration path we're using
  const useV2 = validationModel > 0;
  const activeHash = useV2 ? txHashV2 : txHash;
  const activeIsPending = useV2 ? isPendingV2 : isPending;
  const activeIsConfirming = useV2 ? isConfirmingV2 : isConfirming;
  const activeIsSuccess = useV2 ? isSuccessV2 : isSuccess;
  const activeTxError = useV2 ? txErrorV2 : txError;
  const activeNewAgentId = useV2 ? newAgentIdV2 : newAgentId;

  // After registration success, set fee on-chain if configured
  useEffect(() => {
    if (activeIsSuccess && activeNewAgentId && feePerTask && parseFloat(feePerTask) > 0 && !feeHash && !isFeePending) {
      setFee(activeNewAgentId, parseEther(feePerTask));
    }
  }, [activeIsSuccess, activeNewAgentId, feePerTask, feeHash, isFeePending, setFee]);

  // Redirect to /agents after successful registration (and fee set if applicable)
  const hasFeeToSet = feePerTask && parseFloat(feePerTask) > 0;
  useEffect(() => {
    const done = hasFeeToSet ? (activeIsSuccess && isFeeSuccess) : activeIsSuccess;
    if (done) {
      const timer = setTimeout(() => {
        router.push('/agents');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [activeIsSuccess, isFeeSuccess, hasFeeToSet, router]);

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
      { id: `cap-${Date.now()}`, name: '', description: '', placeholder: '' },
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

    // For StakeSecured/Hybrid, require at least one operator
    if (validationModel > 0 && !selfAsOperator) {
      setUploadError('Stake Secured and Hybrid models require at least one operator. Enable "Register yourself as operator".');
      return;
    }

    setIsSubmitting(true);
    setUploadError(null);

    try {
      // Build ERC-8004 registration JSON
      const registration: Record<string, unknown> = {
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name,
        description,
        image: imageUrl || undefined,
        active: true,
        services: Object.fromEntries(
          Object.entries(services).filter(([, v]) => v.trim() !== ''),
        ),
        tal: {
          capabilities: capabilities.filter((c) => c.name && c.description),
          validationModel,
          ...(requestExample ? { requestExample } : {}),
          ...(feePerTask ? { pricing: { currency: 'TON', perRequest: feePerTask } } : {}),
        },
      };

      // Upload to IPFS via API route
      const uploadRes = await fetch('/api/ipfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration),
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.error || 'IPFS upload failed');
      }

      const { ipfsUri: uri } = await uploadRes.json();
      setIpfsUri(uri);

      // Call contract to register
      if (useV2) {
        // V2 async flow: sign consent → write contract
        await registerV2(uri, validationModel, selfAsOperator);
      } else {
        register(uri);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getButtonLabel = () => {
    if (isSubmitting) return 'Uploading to IPFS...';
    if (isSigning) return 'Sign operator consent...';
    if (activeIsPending) return 'Confirm in wallet...';
    if (activeIsConfirming) return 'Registering...';
    if (isFeePending) return 'Confirm fee in wallet...';
    if (isFeeConfirming) return 'Setting fee...';
    return 'Register Agent';
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/agents"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </Link>

      <h1 className="mb-2 text-3xl font-bold text-white">Register Agent</h1>
      <p className="mb-8 text-zinc-400">
        Register your AI agent on the Tokamak Agent Layer. Your agent will
        receive an ERC-721 token representing its on-chain identity.
      </p>

      {!isConnected && (
        <div className="card mb-6 border-amber-500/20 bg-amber-500/10">
          <p className="text-sm text-amber-400">
            Please connect your wallet to register an agent.
          </p>
        </div>
      )}

      {isConnected && !isL2 && (
        <div className="card mb-6 border-amber-500/20 bg-amber-500/10">
          <p className="text-sm text-amber-400">
            Please switch to Optimism Sepolia network.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Basic Information
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Agent Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                placeholder="My AI Agent"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
              />
              <p className="mt-1 text-xs text-zinc-500">
                {name.length}/100
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                maxLength={1000}
                rows={3}
                placeholder="Describe what your agent does..."
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
              />
              <p className="mt-1 text-xs text-zinc-500">
                {description.length}/1000
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Request Example
              </label>
              <textarea
                value={requestExample}
                onChange={(e) => setRequestExample(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. I have $10,000 to invest with a conservative risk profile..."
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Shown to users as a sample request to help them get started.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Image URL
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/agent-avatar.png"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
              />
            </div>
          </div>
        </div>

        {/* Validation Model */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Validation Model
          </h2>
          <div className="space-y-3">
            {VALIDATION_MODELS.map((model) => (
              <label
                key={model.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  validationModel === model.value
                    ? 'border-[#38BDF8]/50 bg-[#38BDF8]/5'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="validationModel"
                  value={model.value}
                  checked={validationModel === model.value}
                  onChange={() => setValidationModel(model.value)}
                  className="mt-1 accent-[#38BDF8]"
                />
                <div>
                  <span className="text-sm font-medium text-white">{model.label}</span>
                  <p className="mt-0.5 text-xs text-zinc-500">{model.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Operators — visible for StakeSecured / Hybrid */}
        {validationModel > 0 && (
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Operators
            </h2>
            <p className="mb-4 text-sm text-zinc-400">
              Stake Secured and Hybrid agents require at least one operator backing the agent with staked TON.
              Each operator must sign an EIP-712 consent message.
            </p>

            {/* Self-as-operator */}
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              selfAsOperator
                ? 'border-[#38BDF8]/50 bg-[#38BDF8]/5'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}>
              <input
                type="checkbox"
                checked={selfAsOperator}
                onChange={(e) => setSelfAsOperator(e.target.checked)}
                className="mt-1 accent-[#38BDF8]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[#38BDF8]" />
                  <span className="text-sm font-medium text-white">Register yourself as operator</span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Your connected wallet ({address ? shortenAddress(address) : '...'}) will sign an EIP-712 consent
                  and be registered as an operator for this agent.
                </p>
              </div>
            </label>

            {selfAsOperator && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-400">
                  When you click Register, you will be prompted to sign two wallet actions:
                  first an EIP-712 consent signature (gasless), then the registration transaction.
                </p>
              </div>
            )}

            {!selfAsOperator && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                <Info className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">
                  At least one operator is required for {validationModel === 1 ? 'Stake Secured' : 'Hybrid'} agents.
                  Enable the self-operator option or use the SDK to register with external operators.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Fee Configuration */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Fee Configuration
          </h2>
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Fee per Task (TON)
            </label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={feePerTask}
              onChange={(e) => setFeePerTask(e.target.value)}
              placeholder="0.0 (free)"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Leave empty or 0 for free agents. Fee is paid in native TON on Thanos L2.
              You can set or update the fee later from the agent detail page.
            </p>
          </div>
        </div>

        {/* Service Endpoints */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Service Endpoints
          </h2>

          {Object.entries(services).length > 0 && (
            <div className="mb-4 space-y-2">
              {Object.entries(services).map(([type, url]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-zinc-300">
                      {type}:
                    </span>{' '}
                    <span className="text-sm text-zinc-400">{url}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeService(type)}
                    className="text-zinc-600 hover:text-red-500"
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
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
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
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600"
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
            <h2 className="text-lg font-semibold text-white">
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
              <div key={cap.id} className="rounded-lg border border-white/10 p-4">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeCapability(i)}
                    className="text-zinc-600 hover:text-red-500"
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
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600"
                  />
                  <input
                    type="text"
                    value={cap.description}
                    onChange={(e) =>
                      updateCapability(i, 'description', e.target.value)
                    }
                    placeholder="Description"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600"
                  />
                </div>
                <textarea
                  value={cap.placeholder}
                  onChange={(e) => updateCapability(i, 'placeholder', e.target.value)}
                  placeholder="Input hint shown to users (e.g. 'Describe your yield strategy preferences...')"
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600"
                />
              </div>
            ))}

            {capabilities.length === 0 && (
              <p className="text-center text-sm text-zinc-500">
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
            disabled={
              !isConnected || !isL2 || !name || !description ||
              activeIsPending || activeIsConfirming || isSubmitting ||
              (validationModel > 0 && !selfAsOperator)
            }
            className="btn-primary flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            {getButtonLabel()}
          </button>
        </div>

        {/* Status Messages */}
        {uploadError && (
          <div className="card border-red-500/20 bg-red-500/10">
            <p className="text-sm text-red-400">
              <strong>Upload Error:</strong> {uploadError}
            </p>
          </div>
        )}

        {activeTxError && (
          <div className="card border-red-500/20 bg-red-500/10">
            <p className="text-sm text-red-400">
              <strong>Transaction Error:</strong> {activeTxError.message}
            </p>
          </div>
        )}

        {feeError && (
          <div className="card border-red-500/20 bg-red-500/10">
            <p className="text-sm text-red-400">
              <strong>Fee Setup Error:</strong> {feeError.message}
            </p>
          </div>
        )}

        {ipfsUri && !activeIsSuccess && (
          <div className="card border-blue-500/20 bg-blue-500/10">
            <p className="text-sm text-blue-400">
              <strong>Uploaded to IPFS:</strong> {ipfsUri}
            </p>
          </div>
        )}

        {activeIsSuccess && activeHash && (
          <div className="card border-emerald-500/20 bg-emerald-500/10">
            <p className="text-sm text-emerald-400">
              <strong>Agent registered!</strong>{activeNewAgentId ? ` (ID: ${activeNewAgentId.toString()})` : ''} Transaction:{' '}
              <a
                href={`https://explorer.thanos-sepolia.tokamak.network/tx/${activeHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-emerald-300"
              >
                {activeHash.slice(0, 10)}...{activeHash.slice(-8)}
              </a>
            </p>
            {hasFeeToSet && !isFeeSuccess && !feeError && (
              <p className="mt-1 text-sm text-emerald-400">
                {isFeePending ? 'Please confirm fee transaction in wallet...' : isFeeConfirming ? 'Setting agent fee on-chain...' : 'Preparing fee transaction...'}
              </p>
            )}
            {isFeeSuccess && (
              <p className="mt-1 text-sm text-emerald-400">
                <strong>Fee set to {feePerTask} TON per task.</strong> Redirecting...
              </p>
            )}
            {!hasFeeToSet && (
              <p className="mt-1 text-sm text-emerald-400">Redirecting to agents list...</p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
