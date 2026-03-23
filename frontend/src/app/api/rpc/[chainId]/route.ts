import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side RPC proxy — keeps API keys out of client bundles.
 *
 * Client sends JSON-RPC requests to /api/rpc/<chainId>, this route
 * forwards them to the real RPC endpoint (with the secret API key)
 * and returns the response.
 */

// Map chain IDs to RPC URLs using SERVER-ONLY env vars (no NEXT_PUBLIC_ prefix)
function getRpcUrl(chainId: string): string | null {
  const urls: Record<string, string | undefined> = {
    '1': process.env.RPC_MAINNET,
    '10': process.env.RPC_OPTIMISM,
    '42161': process.env.RPC_ARBITRUM,
    '11155111': process.env.RPC_SEPOLIA,
    '999': process.env.RPC_HYPER_MAINNET,
    '998': process.env.RPC_HYPER_TESTNET,
    '111551119090': process.env.RPC_THANOS_SEPOLIA,
  };
  return urls[chainId] ?? null;
}

// Only allow standard JSON-RPC read methods — block signing/admin methods
const ALLOWED_METHODS = new Set([
  'eth_call',
  'eth_getBalance',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getLogs',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_getTransactionCount',
  'eth_chainId',
  'net_version',
  'eth_feeHistory',
  'eth_maxPriorityFeePerGas',
  'eth_sendRawTransaction',
  'eth_getProof',
  'multicall3_aggregate',
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { chainId: string } }
) {
  const { chainId } = params;
  const rpcUrl = getRpcUrl(chainId);

  if (!rpcUrl) {
    return NextResponse.json(
      { error: `Unsupported chain: ${chainId}` },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate JSON-RPC method (support single and batch requests)
  const requests = Array.isArray(body) ? body : [body];
  for (const req of requests) {
    if (!req || typeof req !== 'object' || !('method' in req)) {
      return NextResponse.json(
        { error: 'Invalid JSON-RPC request' },
        { status: 400 }
      );
    }
    if (!ALLOWED_METHODS.has((req as { method: string }).method)) {
      return NextResponse.json(
        { error: `Method not allowed: ${(req as { method: string }).method}` },
        { status: 403 }
      );
    }
  }

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'RPC request failed' },
      { status: 502 }
    );
  }
}
