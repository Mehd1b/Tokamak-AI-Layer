import { NextResponse } from 'next/server';
import { resolveAgent } from '../../resolve';

export async function GET(
  _request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const { runtimeBaseUrl, runtimeAgentId, a2aUrl } = await resolveAgent(
      params.agentId,
    );

    if (!runtimeBaseUrl && !a2aUrl) {
      // Agent exists on-chain but has no service endpoint
      return NextResponse.json(null);
    }

    const infoUrl = `${runtimeBaseUrl}/api/agents/${runtimeAgentId}`;
    const res = await fetch(infoUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json(null);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await res.json();

    // Normalize A2A agent cards to the RuntimeAgent format expected by the frontend.
    // A2A cards have { capabilities: {streaming, ...}, skills: [{id, name, ...}] }
    // RuntimeAgent expects { capabilities: [{id, name, description}] }
    if (body.skills && !Array.isArray(body.capabilities)) {
      return NextResponse.json({
        id: runtimeAgentId,
        name: body.name || '',
        description: body.description || '',
        version: body.version || '0.1.0',
        capabilities: (body.skills || []).map((s: { id?: string; name?: string; description?: string }) => ({
          id: s.id || '',
          name: s.name || '',
          description: s.description || '',
        })),
        status: 'running',
        endpoint: a2aUrl || infoUrl,
        onChainId: params.agentId,
      });
    }

    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/runtime/info]', err);
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    if (msg.includes('No agentURI') || msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
