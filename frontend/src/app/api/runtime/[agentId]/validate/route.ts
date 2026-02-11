import { NextResponse } from 'next/server';
import { resolveAgent, proxyPost } from '../../resolve';

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const body = await request.json();

    if (!body.taskId) {
      return NextResponse.json(
        { error: 'taskId is required in the request body' },
        { status: 400 },
      );
    }

    // Validate optional requestHash format (bytes32 hex string)
    if (body.requestHash && !/^0x[0-9a-fA-F]{64}$/.test(body.requestHash)) {
      return NextResponse.json(
        { error: 'requestHash must be a valid bytes32 hex string (0x + 64 hex chars)' },
        { status: 400 },
      );
    }

    const { runtimeBaseUrl } = await resolveAgent(params.agentId);

    // Proxy to agent runtime's validation execute endpoint
    const url = `${runtimeBaseUrl}/api/validations/execute`;
    console.log(`[api/validate] Proxying to ${url} for agent ${params.agentId}`);

    return proxyPost(url, body, 300_000);
  } catch (err) {
    console.error('[api/validate]', err);
    const msg = err instanceof Error ? err.message : 'Resolution failed';

    // Return appropriate status based on the error
    if (msg.includes('No agentURI') || msg.includes('not found')) {
      return NextResponse.json(
        { error: `Agent ${params.agentId} not found on-chain: ${msg}` },
        { status: 404 },
      );
    }
    if (msg.includes('Failed to fetch metadata') || msg.includes('IPFS')) {
      return NextResponse.json(
        { error: `Could not fetch agent metadata: ${msg}` },
        { status: 502 },
      );
    }
    if (msg.includes('no A2A service')) {
      return NextResponse.json(
        { error: `Agent has no runtime endpoint configured: ${msg}` },
        { status: 422 },
      );
    }

    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
