import type { AgentMetadata } from '../types';

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

/**
 * Resolves an IPFS URI (ipfs://<cid>) to an HTTPS gateway URL.
 * If the URI is already HTTPS, returns it unchanged.
 */
export function resolveMetadataURI(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length);
    return `${IPFS_GATEWAYS[0]}${cid}`;
  }
  if (uri.startsWith('ar://')) {
    const txId = uri.slice('ar://'.length);
    return `https://arweave.net/${txId}`;
  }
  return uri;
}

/**
 * Validates that a value loosely conforms to the AgentMetadata shape.
 * Returns true if the required fields are present with correct types.
 */
function isAgentMetadata(value: unknown): value is AgentMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.author === 'string' &&
    typeof obj.strategy === 'string' &&
    Array.isArray(obj.tags) &&
    obj.tags.every((t: unknown) => typeof t === 'string')
  );
}

/**
 * Fetches and validates agent metadata from a URI (IPFS or HTTPS).
 *
 * @param uri - The metadata URI (ipfs:// or https://)
 * @returns The parsed AgentMetadata or null if the fetch fails or the data is invalid
 */
export async function fetchAgentMetadata(uri: string): Promise<AgentMetadata | null> {
  if (!uri) return null;

  const url = resolveMetadataURI(uri);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data: unknown = await response.json();

    if (!isAgentMetadata(data)) return null;

    return data;
  } catch {
    return null;
  }
}
