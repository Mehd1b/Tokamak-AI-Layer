import { createPublicClient, http, type Chain } from 'viem';
import { NextResponse } from 'next/server';
import { THANOS_RPC_URL, IDENTITY_REGISTRY_ADDRESS } from '@/lib/rpc';

const AGENT_URI_ABI = [
  {
    type: 'function' as const,
    name: 'agentURI' as const,
    inputs: [{ name: 'agentId', type: 'uint256' as const }],
    outputs: [{ name: '', type: 'string' as const }],
    stateMutability: 'view' as const,
  },
] as const;

const thanosSepolia: Chain = {
  id: 111551119090,
  name: 'Thanos Sepolia',
  nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  rpcUrls: { default: { http: [THANOS_RPC_URL] } },
};

const client = createPublicClient({
  chain: thanosSepolia,
  transport: http(THANOS_RPC_URL),
});

// ---------------------------------------------------------------------------
// In-memory cache (per-process, resets on cold start)
// ---------------------------------------------------------------------------

interface ResolvedAgent {
  runtimeBaseUrl: string;
  runtimeAgentId: string;
}

interface CacheEntry {
  data: ResolvedAgent;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
];

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export async function resolveAgent(
  onChainAgentId: string,
): Promise<ResolvedAgent> {
  // Check cache
  const cached = cache.get(onChainAgentId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // 1. Call agentURI on IdentityRegistry
  const agentIdBigInt = BigInt(onChainAgentId);
  console.log(`[resolve] Calling agentURI(${onChainAgentId}) on ${IDENTITY_REGISTRY_ADDRESS} via ${THANOS_RPC_URL}`);
  const uri = await client.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: AGENT_URI_ABI,
    functionName: 'agentURI',
    args: [agentIdBigInt],
  });
  console.log(`[resolve] agentURI(${onChainAgentId}) = "${uri}"`);

  if (!uri) {
    throw new Error(`No agentURI for agent ${onChainAgentId}`);
  }

  // 2–3. Fetch metadata (try multiple IPFS gateways)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let metadata: any = null;

  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    let lastError: Error | null = null;
    let fetched = false;

    for (const gateway of IPFS_GATEWAYS) {
      const metadataUrl = `${gateway}${cid}`;
      console.log(`[resolve] Trying ${metadataUrl}`);
      try {
        const res = await fetch(metadataUrl, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status} from ${gateway}`);
          continue;
        }
        metadata = await res.json();
        fetched = true;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Fetch failed');
      }
    }

    if (!fetched) {
      throw new Error(
        `Failed to fetch metadata for agent ${onChainAgentId}: ${lastError?.message}`,
      );
    }
  } else {
    const res = await fetch(uri, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to fetch metadata for agent ${onChainAgentId}: HTTP ${res.status}`,
      );
    }
    metadata = await res.json();
  }
  console.log(`[resolve] Metadata keys: ${Object.keys(metadata).join(', ')}`, metadata.services);

  // 4. Extract services.A2A
  const a2aUrl: string | undefined = metadata.services?.A2A;
  if (!a2aUrl) {
    throw new Error(
      `Agent ${onChainAgentId} has no A2A service URL in metadata`,
    );
  }
  console.log(`[resolve] A2A URL: ${a2aUrl}`);

  // 5. Parse: runtimeBaseUrl = origin, runtimeAgentId = last path segment
  const parsed = new URL(a2aUrl);
  const runtimeBaseUrl = parsed.origin;
  const segments = parsed.pathname.split('/').filter(Boolean);
  const runtimeAgentId = segments[segments.length - 1];

  const data: ResolvedAgent = { runtimeBaseUrl, runtimeAgentId };
  console.log(`[resolve] Resolved: base=${runtimeBaseUrl}, agentId=${runtimeAgentId}`);

  // 6. Cache with TTL
  cache.set(onChainAgentId, { data, expiresAt: Date.now() + CACHE_TTL });

  return data;
}

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

export async function proxyGet(url: string): Promise<NextResponse> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Proxy request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function proxyPost(
  url: string,
  body: unknown,
  timeoutMs = 30_000,
): Promise<NextResponse> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Proxy request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
