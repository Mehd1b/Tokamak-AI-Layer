import { NextResponse } from 'next/server';
import { resolveAgent, proxyPost } from '../../resolve';

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const { runtimeBaseUrl } = await resolveAgent(params.agentId);
    const body = await request.json();
    return proxyPost(`${runtimeBaseUrl}/api/validations/execute`, body, 300_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
