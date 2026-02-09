import { NextResponse } from 'next/server';
import { resolveAgent, proxyGet } from '../../resolve';

export async function GET(
  _request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const { runtimeBaseUrl, runtimeAgentId } = await resolveAgent(
      params.agentId,
    );
    return proxyGet(`${runtimeBaseUrl}/api/agents/${runtimeAgentId}`);
  } catch (err) {
    console.error('[api/runtime/info]', err);
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
