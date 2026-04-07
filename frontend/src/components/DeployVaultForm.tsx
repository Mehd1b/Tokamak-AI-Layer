'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useNetwork } from '@/lib/NetworkContext';
import { AgentRegistryABI, VaultFactoryABI } from '@/lib/contracts';
import { useLegacyGas } from '@/hooks/useLegacyGas';
import { parseVaultError } from '@/lib/vaultErrors';
import { truncateAddress, formatBytes32, isValidBytes32 } from '@/lib/utils';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

/** Common vault assets per chain. Key = chainId. */
const COMMON_ASSETS: Record<number, { label: string; address: `0x${string}` }[]> = {
  1: [
    { label: 'ETH (Native)', address: ZERO_ADDRESS },
    { label: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    { label: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
    { label: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  ],
  999: [
    { label: 'ETH (Native)', address: ZERO_ADDRESS },
  ],
  42161: [
    { label: 'ETH (Native)', address: ZERO_ADDRESS },
    { label: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
    { label: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
    { label: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
  ],
  10: [
    { label: 'ETH (Native)', address: ZERO_ADDRESS },
    { label: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
    { label: 'USDT', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' },
    { label: 'WETH', address: '0x4200000000000000000000000000000000000006' },
  ],
  137: [
    { label: 'USDC (Native)', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
    { label: 'POL (Native)', address: ZERO_ADDRESS },
    { label: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' },
  ],
  11155111: [
    { label: 'ETH (Native)', address: ZERO_ADDRESS },
  ],
  998: [
    { label: 'ETH (Native)', address: ZERO_ADDRESS },
  ],
};

type Step = 1 | 2 | 3 | 4;

/* ------------------------------------------------------------------ */
/*  Agent metadata helper                                              */
/* ------------------------------------------------------------------ */

function resolveUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length);
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return uri;
}

interface AgentEntry {
  agentId: string;
  author: string;
  imageId: string;
  exists: boolean;
  name?: string;
  strategy?: string;
  description?: string;
}

/* ------------------------------------------------------------------ */
/*  Spinner SVG                                                        */
/* ------------------------------------------------------------------ */

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function DeployVaultForm() {
  const { address: userAddress, isConnected } = useAccount();
  const { contracts, selectedChainId, explorerUrl } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });
  const gasOverrides = useLegacyGas();

  /* --- Form state --- */
  const [step, setStep] = useState<Step>(1);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [manualAgentId, setManualAgentId] = useState('');
  const [useManualAgent, setUseManualAgent] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [customAsset, setCustomAsset] = useState('');
  const [useCustomAsset, setUseCustomAsset] = useState(false);
  const [userSalt, setUserSalt] = useState('');
  const [deployedVaultAddress, setDeployedVaultAddress] = useState<string | null>(null);

  /* --- Fetch all registered agents with metadata --- */
  const { data: agents, isLoading: isLoadingAgents } = useQuery<AgentEntry[]>({
    queryKey: ['allAgentsWithMetadata', selectedChainId],
    queryFn: async () => {
      if (!client || !contracts?.agentRegistry) return [];

      const agentIds = await client.readContract({
        address: contracts.agentRegistry,
        abi: AgentRegistryABI,
        functionName: 'getAllAgentIds',
      }) as `0x${string}`[];

      if (agentIds.length === 0) return [];

      // Fetch agent info + metadata URI in parallel
      const entries: AgentEntry[] = await Promise.all(
        agentIds.map(async (agentId) => {
          const data = await client.readContract({
            address: contracts.agentRegistry,
            abi: AgentRegistryABI,
            functionName: 'get',
            args: [agentId],
          }) as { author: string; imageId: string; exists: boolean };

          const entry: AgentEntry = {
            agentId,
            author: data.author,
            imageId: data.imageId,
            exists: data.exists,
          };

          // Try to fetch metadata
          try {
            const uri = await client.readContract({
              address: contracts.agentRegistry,
              abi: AgentRegistryABI,
              functionName: 'getMetadataURI',
              args: [agentId],
            }) as string;

            if (uri && uri !== '') {
              const fetchUrl = resolveUri(uri);
              const resp = await fetch(fetchUrl);
              if (resp.ok) {
                const json = await resp.json();
                entry.name = json.name;
                entry.strategy = json.strategy;
                entry.description = json.description;
              }
            }
          } catch {
            // Skip metadata fetch failures
          }

          return entry;
        }),
      );

      return entries.filter((e) => e.exists);
    },
    enabled: !!client && !!contracts?.agentRegistry,
    staleTime: 60_000,
  });

  /* --- Resolve the effective agent id --- */
  const effectiveAgentId = useMemo(() => {
    const raw = useManualAgent ? manualAgentId.trim() : selectedAgentId;
    if (!raw) return undefined;
    if (isValidBytes32(raw)) return raw as `0x${string}`;
    return undefined;
  }, [useManualAgent, manualAgentId, selectedAgentId]);

  /* --- Get imageId for the selected agent --- */
  const selectedAgentInfo = useMemo(() => {
    if (!effectiveAgentId || !agents) return undefined;
    return agents.find((a) => a.agentId.toLowerCase() === effectiveAgentId.toLowerCase());
  }, [effectiveAgentId, agents]);

  /* --- Resolve the effective asset --- */
  const effectiveAsset = useMemo((): `0x${string}` | undefined => {
    const raw = useCustomAsset ? customAsset.trim() : selectedAsset;
    if (!raw) return undefined;
    if (/^0x[0-9a-fA-F]{40}$/.test(raw)) return raw as `0x${string}`;
    return undefined;
  }, [useCustomAsset, customAsset, selectedAsset]);

  /* --- Generate random salt if empty --- */
  const effectiveSalt = useMemo((): `0x${string}` => {
    if (userSalt.trim() && isValidBytes32(userSalt.trim())) {
      return userSalt.trim() as `0x${string}`;
    }
    return ZERO_BYTES32;
  }, [userSalt]);

  /* --- Auto-generate salt on mount --- */
  useEffect(() => {
    if (!userSalt) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const hex = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      setUserSalt(hex);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Compute expected vault address --- */
  const { data: computedVault } = useQuery({
    queryKey: [
      'computeVaultAddress',
      selectedChainId,
      userAddress,
      effectiveAgentId,
      effectiveAsset,
      effectiveSalt,
    ],
    queryFn: async () => {
      if (!client || !userAddress || !effectiveAgentId || !effectiveAsset) return null;
      try {
        const result = await client.readContract({
          address: contracts.vaultFactory,
          abi: VaultFactoryABI,
          functionName: 'computeVaultAddress',
          args: [userAddress, effectiveAgentId, effectiveAsset, effectiveSalt],
        }) as [string, string];
        return { vault: result[0], salt: result[1] };
      } catch {
        return null;
      }
    },
    enabled: !!client && !!userAddress && !!effectiveAgentId && !!effectiveAsset && step >= 3,
    staleTime: 10_000,
  });

  /* --- Deploy transaction --- */
  const {
    data: deployHash,
    writeContract: writeDeployVault,
    isPending: isDeployPending,
    error: deployWriteError,
    reset: resetDeploy,
  } = useWriteContract();

  const {
    isLoading: isDeployConfirming,
    isSuccess: isDeploySuccess,
    data: deployReceipt,
    error: deployReceiptError,
  } = useWaitForTransactionReceipt({ hash: deployHash, chainId: selectedChainId });

  const deployError = deployWriteError || deployReceiptError;

  // Extract deployed vault address from receipt logs
  useEffect(() => {
    if (isDeploySuccess && deployReceipt) {
      // VaultDeployed event topic0
      const vaultDeployedTopic = '0x' + 'VaultDeployed'.length; // We'll just parse the first log's address
      // The VaultDeployed event has the vault address as the first indexed param
      for (const log of deployReceipt.logs) {
        // The VaultDeployed event signature: VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)
        // log.topics[1] is the vault address
        if (log.topics.length >= 3 && log.address.toLowerCase() === contracts.vaultFactory.toLowerCase()) {
          const vaultAddr = '0x' + (log.topics[1]?.slice(26) ?? '');
          if (vaultAddr.length === 42) {
            setDeployedVaultAddress(vaultAddr);
            return;
          }
        }
      }
      // Fallback: use computed vault address
      if (computedVault?.vault) {
        setDeployedVaultAddress(computedVault.vault);
      }
    }
  }, [isDeploySuccess, deployReceipt, contracts.vaultFactory, computedVault]);

  /* --- Handlers --- */
  const handleDeploy = () => {
    if (!effectiveAgentId || !effectiveAsset || !selectedAgentInfo) return;
    const expectedImageId = selectedAgentInfo.imageId as `0x${string}`;
    writeDeployVault({
      address: contracts.vaultFactory,
      abi: VaultFactoryABI,
      functionName: 'deployVault',
      args: [effectiveAgentId, effectiveAsset, effectiveSalt, expectedImageId],
      chainId: selectedChainId,
      ...gasOverrides,
    });
  };

  const handleReset = () => {
    setStep(1);
    setSelectedAgentId('');
    setManualAgentId('');
    setUseManualAgent(false);
    setSelectedAsset('');
    setCustomAsset('');
    setUseCustomAsset(false);
    setUserSalt('');
    setDeployedVaultAddress(null);
    resetDeploy();
    // Generate new salt
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    setUserSalt(hex);
  };

  /* --- Available assets for current chain --- */
  const availableAssets = COMMON_ASSETS[selectedChainId] ?? [{ label: 'ETH (Native)', address: ZERO_ADDRESS }];

  /* --- Validation per step --- */
  const canProceedStep1 = !!effectiveAgentId;
  const canProceedStep2 = !!effectiveAsset;
  const canProceedStep3 = !!effectiveSalt && !!effectiveAgentId && !!effectiveAsset;
  const canDeploy = canProceedStep3 && !!selectedAgentInfo?.imageId;

  /* --- Step indicator --- */
  const steps = [
    { n: 1, label: 'Select Agent' },
    { n: 2, label: 'Choose Asset' },
    { n: 3, label: 'Configure' },
    { n: 4, label: 'Deploy' },
  ];

  /* --- Wallet not connected --- */
  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-16 px-6">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#A855F7]/5 border border-[#A855F7]/10 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#A855F7]/40" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
            </svg>
          </div>
        </div>
        <p className="text-gray-400 text-sm mb-1">Wallet connection required</p>
        <p className="text-gray-600 text-xs font-mono mb-6">Connect your wallet to deploy a vault.</p>
      </div>
    );
  }

  /* --- Success state --- */
  if (isDeploySuccess && deployedVaultAddress) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h3 className="text-xl font-light text-white mb-2" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Vault Deployed
        </h3>
        <p className="text-gray-400 text-sm mb-6 font-mono">
          Your vault has been successfully deployed.
        </p>

        <div className="rounded-xl border border-white/5 bg-[#12121a]/80 p-4 mb-6 text-left">
          <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">Vault Address</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-white break-all">{deployedVaultAddress}</span>
            <a
              href={`${explorerUrl}/address/${deployedVaultAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-[#A855F7] transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
          {deployHash && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">Transaction</div>
              <a
                href={`${explorerUrl}/tx/${deployHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-[#A855F7] hover:underline break-all"
              >
                {truncateAddress(deployHash, 12)}
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/vaults/${deployedVaultAddress}`}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            View Vault
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <button onClick={handleReset} className="btn-secondary inline-flex items-center justify-center gap-2">
            Deploy Another
          </button>
        </div>
      </div>
    );
  }

  const CHAIN_NAMES: Record<number, string> = {
    1: 'Ethereum Mainnet',
    999: 'HyperEVM',
    42161: 'Arbitrum One',
    10: 'Optimism',
    11155111: 'Sepolia Testnet',
    998: 'HyperEVM Testnet',
  };

  const CHAIN_COLORS: Record<number, string> = {
    1: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
    999: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
    42161: 'border-sky-500/30 bg-sky-500/5 text-sky-400',
    10: 'border-red-500/30 bg-red-500/5 text-red-400',
    11155111: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-400',
    998: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-400',
  };

  return (
    <div className="space-y-8">
      {/* Target network info */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${CHAIN_COLORS[selectedChainId] ?? 'border-white/10 bg-white/5 text-gray-400'}`}>
        <div className="w-2 h-2 rounded-full bg-current animate-pulse shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono font-semibold uppercase tracking-wider">
            Deploying to {CHAIN_NAMES[selectedChainId] ?? `Chain ${selectedChainId}`}
          </p>
          <p className="text-[10px] font-mono opacity-60 mt-0.5 truncate">
            Registry: {contracts?.agentRegistry ? truncateAddress(contracts.agentRegistry, 6) : '—'}
            {' · '}
            Factory: {contracts?.vaultFactory ? truncateAddress(contracts.vaultFactory, 6) : '—'}
          </p>
        </div>
        <span className="text-[10px] font-mono opacity-40 shrink-0">ID: {selectedChainId}</span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center flex-1">
            <button
              onClick={() => {
                if (s.n < step) setStep(s.n as Step);
              }}
              disabled={s.n > step}
              className={`flex items-center gap-1.5 sm:gap-2 text-xs font-mono transition-colors min-h-[44px] sm:min-h-0 ${
                s.n === step
                  ? 'text-[#C084FC]'
                  : s.n < step
                    ? 'text-emerald-400 cursor-pointer hover:text-emerald-300'
                    : 'text-gray-600 cursor-default'
              }`}
            >
              <span
                className={`w-6 h-6 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors shrink-0 ${
                  s.n === step
                    ? 'border-[#A855F7]/50 bg-[#A855F7]/10 text-[#C084FC]'
                    : s.n < step
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                      : 'border-white/10 bg-white/[0.02] text-gray-600'
                }`}
              >
                {s.n < step ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s.n
                )}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 sm:mx-2 ${s.n < step ? 'bg-emerald-500/30' : 'bg-white/5'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Agent */}
      {step === 1 && (
        <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-6">
          <h3 className="text-lg font-light text-white mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            Select Agent
          </h3>
          <p className="text-gray-500 text-xs font-mono mb-6">
            Choose a registered agent to manage your vault.
          </p>

          {/* Toggle: registry vs manual */}
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => setUseManualAgent(false)}
              className={`px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all border ${
                !useManualAgent
                  ? 'bg-[#A855F7]/15 text-[#C084FC] border-white/10'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              From Registry
            </button>
            <button
              onClick={() => setUseManualAgent(true)}
              className={`px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all border ${
                useManualAgent
                  ? 'bg-[#A855F7]/15 text-[#C084FC] border-white/10'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              Enter Agent ID
            </button>
          </div>

          {!useManualAgent ? (
            <>
              {isLoadingAgents ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="w-5 h-5 text-gray-500" />
                  <span className="ml-2 text-sm text-gray-500 font-mono">Loading agents...</span>
                </div>
              ) : agents && agents.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {agents.map((agent) => {
                    const isSelected = selectedAgentId === agent.agentId;
                    return (
                      <button
                        key={agent.agentId}
                        onClick={() => setSelectedAgentId(agent.agentId)}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-[#A855F7]/40 bg-[#A855F7]/5'
                            : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-white truncate">
                                {agent.name || truncateAddress(agent.agentId, 8)}
                              </span>
                              {agent.strategy && (
                                <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-mono bg-violet-500/15 text-violet-400 border border-violet-500/20">
                                  {agent.strategy}
                                </span>
                              )}
                            </div>
                            {agent.description && (
                              <p className="text-xs text-gray-500 font-mono line-clamp-2 mb-1.5">
                                {agent.description}
                              </p>
                            )}
                            <div className="text-[10px] font-mono text-gray-600">
                              Author: {truncateAddress(agent.author)}
                            </div>
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 transition-colors ${
                              isSelected
                                ? 'border-[#A855F7] bg-[#A855F7]'
                                : 'border-gray-600'
                            }`}
                          >
                            {isSelected && (
                              <svg className="w-full h-full text-white p-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 text-[10px] font-mono text-gray-600 break-all">
                          {formatBytes32(agent.agentId)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-sm font-mono">No agents registered on this network.</p>
                  <p className="text-gray-600 text-xs font-mono mt-1">Switch to &quot;Enter Agent ID&quot; to provide one manually.</p>
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="text-sm text-gray-400 block mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                Agent ID (bytes32)
              </label>
              <input
                type="text"
                value={manualAgentId}
                onChange={(e) => setManualAgentId(e.target.value)}
                placeholder="0x..."
                className="input-dark font-mono w-full"
              />
              {manualAgentId && !isValidBytes32(manualAgentId.trim()) && (
                <p className="text-red-400 text-xs font-mono mt-1">Must be a valid bytes32 hex string (0x + 64 hex chars)</p>
              )}
            </div>
          )}

          {/* Next button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="btn-primary inline-flex items-center gap-2 text-sm min-h-[44px] w-full sm:w-auto justify-center"
            >
              Next: Choose Asset
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Choose Asset */}
      {step === 2 && (
        <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-6">
          <h3 className="text-lg font-light text-white mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            Choose Asset
          </h3>
          <p className="text-gray-500 text-xs font-mono mb-6">
            Select the denomination asset for your vault.
          </p>

          {/* Toggle: common assets vs custom */}
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => setUseCustomAsset(false)}
              className={`px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all border ${
                !useCustomAsset
                  ? 'bg-[#A855F7]/15 text-[#C084FC] border-white/10'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              Common Assets
            </button>
            <button
              onClick={() => setUseCustomAsset(true)}
              className={`px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all border ${
                useCustomAsset
                  ? 'bg-[#A855F7]/15 text-[#C084FC] border-white/10'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              Custom Address
            </button>
          </div>

          {!useCustomAsset ? (
            <div className="space-y-2">
              {availableAssets.map((asset) => {
                const isSelected = selectedAsset === asset.address;
                return (
                  <button
                    key={asset.address}
                    onClick={() => setSelectedAsset(asset.address)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-[#A855F7]/40 bg-[#A855F7]/5'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-white">{asset.label}</span>
                        <div className="text-[10px] font-mono text-gray-600 mt-0.5">
                          {asset.address === ZERO_ADDRESS ? 'Native token (address(0))' : asset.address}
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${
                          isSelected ? 'border-[#A855F7] bg-[#A855F7]' : 'border-gray-600'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-full h-full text-white p-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <label className="text-sm text-gray-400 block mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                Asset Address
              </label>
              <input
                type="text"
                value={customAsset}
                onChange={(e) => setCustomAsset(e.target.value)}
                placeholder="0x..."
                className="input-dark font-mono w-full"
              />
              {customAsset && !/^0x[0-9a-fA-F]{40}$/.test(customAsset.trim()) && (
                <p className="text-red-400 text-xs font-mono mt-1">Must be a valid Ethereum address (0x + 40 hex chars)</p>
              )}
              <p className="text-gray-600 text-[10px] font-mono mt-1">
                Use {ZERO_ADDRESS} for native ETH.
              </p>
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-6 flex justify-between gap-3">
            <button onClick={() => setStep(1)} className="btn-secondary inline-flex items-center gap-2 text-sm min-h-[44px]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
              </svg>
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className="btn-primary inline-flex items-center gap-2 text-sm min-h-[44px]"
            >
              Next: Configure
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Configure */}
      {step === 3 && (
        <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-6">
          <h3 className="text-lg font-light text-white mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            Configure
          </h3>
          <p className="text-gray-500 text-xs font-mono mb-6">
            Review configuration and customize the deployment salt.
          </p>

          {/* Summary */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Agent</span>
              <span className="text-sm font-mono text-white">
                {selectedAgentInfo?.name || (effectiveAgentId ? formatBytes32(effectiveAgentId) : '-')}
              </span>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Asset</span>
              <span className="text-sm font-mono text-white">
                {effectiveAsset === ZERO_ADDRESS
                  ? 'ETH (Native)'
                  : effectiveAsset
                    ? truncateAddress(effectiveAsset, 6)
                    : '-'}
              </span>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Image ID</span>
              <span className="text-xs font-mono text-gray-400">
                {selectedAgentInfo?.imageId ? formatBytes32(selectedAgentInfo.imageId) : '-'}
              </span>
            </div>
          </div>

          {/* Salt input */}
          <div className="mb-6">
            <label className="text-sm text-gray-400 block mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
              Deployment Salt (bytes32)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={userSalt}
                onChange={(e) => setUserSalt(e.target.value)}
                placeholder="0x..."
                className="input-dark font-mono w-full text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  const bytes = new Uint8Array(32);
                  crypto.getRandomValues(bytes);
                  const hex = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
                  setUserSalt(hex);
                }}
                className="btn-secondary shrink-0 text-xs px-3"
              >
                Randomize
              </button>
            </div>
            {userSalt && !isValidBytes32(userSalt.trim()) && (
              <p className="text-red-400 text-xs font-mono mt-1">Must be a valid bytes32 hex string</p>
            )}
          </div>

          {/* Expected vault address preview */}
          {computedVault?.vault && (
            <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4 mb-6">
              <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400/70 mb-1">
                Expected Vault Address
              </div>
              <span className="text-sm font-mono text-emerald-400 break-all">{computedVault.vault}</span>
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-6 flex justify-between gap-3">
            <button onClick={() => setStep(2)} className="btn-secondary inline-flex items-center gap-2 text-sm min-h-[44px]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
              </svg>
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!canProceedStep3}
              className="btn-primary inline-flex items-center gap-2 text-sm min-h-[44px]"
            >
              Next: Deploy
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Deploy */}
      {step === 4 && (
        <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-6">
          <h3 className="text-lg font-light text-white mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            Deploy Vault
          </h3>
          <p className="text-gray-500 text-xs font-mono mb-6">
            Review the final parameters and confirm the deployment transaction.
          </p>

          {/* Final summary */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3 mb-6">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-0.5">Agent</div>
              <div className="text-sm font-mono text-white">
                {selectedAgentInfo?.name || (effectiveAgentId ? formatBytes32(effectiveAgentId) : '-')}
              </div>
              {effectiveAgentId && (
                <div className="text-[10px] font-mono text-gray-600 break-all mt-0.5">{effectiveAgentId}</div>
              )}
            </div>
            <div className="h-px bg-white/5" />
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-0.5">Asset</div>
              <div className="text-sm font-mono text-white">
                {effectiveAsset === ZERO_ADDRESS ? 'ETH (Native)' : effectiveAsset || '-'}
              </div>
            </div>
            <div className="h-px bg-white/5" />
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-0.5">Salt</div>
              <div className="text-[10px] font-mono text-gray-400 break-all">{effectiveSalt}</div>
            </div>
            <div className="h-px bg-white/5" />
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-0.5">Expected Image ID</div>
              <div className="text-[10px] font-mono text-gray-400 break-all">
                {selectedAgentInfo?.imageId || '-'}
              </div>
            </div>
            {computedVault?.vault && (
              <>
                <div className="h-px bg-white/5" />
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-0.5">Expected Vault Address</div>
                  <div className="text-sm font-mono text-emerald-400 break-all">{computedVault.vault}</div>
                </div>
              </>
            )}
          </div>

          {/* Warning */}
          <div className="rounded-xl border border-yellow-500/10 bg-yellow-500/5 p-4 mb-6">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-xs text-yellow-400/80 font-mono">
                Deploying a vault is an on-chain transaction. Only the agent author can deploy vaults for their agent. Make sure you are connected with the correct wallet.
              </div>
            </div>
          </div>

          {/* Error display */}
          {deployError && (
            <div className="flex items-start gap-2 text-red-400 text-sm font-mono p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-6">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {parseVaultError(deployError as Error)}
            </div>
          )}

          {/* Nav + Deploy buttons */}
          <div className="flex justify-between sticky bottom-16 md:static bg-[#12121a]/95 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none py-3 md:py-0 -mx-6 px-6 md:mx-0 md:px-0 border-t border-white/5 md:border-0">
            <button
              onClick={() => setStep(3)}
              disabled={isDeployPending || isDeployConfirming}
              className="btn-secondary inline-flex items-center gap-2 text-sm min-h-[44px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
              </svg>
              Back
            </button>
            <button
              onClick={handleDeploy}
              disabled={!canDeploy || isDeployPending || isDeployConfirming}
              className="btn-primary inline-flex items-center justify-center gap-2 text-sm min-w-[160px] min-h-[44px]"
            >
              {(isDeployPending || isDeployConfirming) && <Spinner />}
              {isDeployPending
                ? 'Signing...'
                : isDeployConfirming
                  ? 'Confirming...'
                  : 'Deploy Vault'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
