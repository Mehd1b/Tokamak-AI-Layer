import { NextResponse } from 'next/server';
import { resolveAgent, proxyGet, proxyPost } from '../../resolve';

export const maxDuration = 300; // seconds — AI tasks can take a while

export async function GET(
  _request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const { runtimeBaseUrl } = await resolveAgent(params.agentId);
    return proxyGet(`${runtimeBaseUrl}/api/tasks`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const { runtimeBaseUrl, runtimeAgentId } = await resolveAgent(
      params.agentId,
    );
    const body = await request.json();
    // Inject the resolved runtime agentId into the request body
    return proxyPost(
      `${runtimeBaseUrl}/api/tasks`,
      { ...body, agentId: runtimeAgentId },
      300_000,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
