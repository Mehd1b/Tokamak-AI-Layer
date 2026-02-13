import { NextResponse } from 'next/server';
import { resolveAgent, proxyGet, proxyPost } from '../../resolve';

export const maxDuration = 300; // seconds - AI tasks can take a while

export async function GET(
  _request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const { runtimeBaseUrl } = await resolveAgent(params.agentId);
    return proxyGet(`${runtimeBaseUrl}/api/tasks`);
  } catch (err) {
    console.error('[api/tasks GET]', err);
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    if (msg.includes('No agentURI') || msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const body = await request.json();

    if (!body.input?.text) {
      return NextResponse.json(
        { error: 'input.text is required in the request body' },
        { status: 400 },
      );
    }

    const { runtimeBaseUrl, runtimeAgentId } = await resolveAgent(
      params.agentId,
    );

    // Inject the resolved runtime agentId into the request body
    const url = `${runtimeBaseUrl}/api/tasks`;
    const payload = { ...body, agentId: runtimeAgentId };
    console.log(`[api/tasks POST] Proxying to ${url} for agent ${runtimeAgentId}, taskRef=${body.taskRef?.slice(0, 18)}...`);

    return proxyPost(
      url,
      payload,
      300_000,
    );
  } catch (err) {
    console.error('[api/tasks POST]', err);
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    if (msg.includes('No agentURI') || msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
