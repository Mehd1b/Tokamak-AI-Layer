import { NextRequest, NextResponse } from 'next/server';
import { getCommentCountsByVaults } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const vaultsParam = req.nextUrl.searchParams.get('vaults');

    if (!vaultsParam) {
      return NextResponse.json({ error: 'Missing vaults parameter' }, { status: 400 });
    }

    const vaults = vaultsParam.split(',').filter((v) => /^0x[0-9a-fA-F]{40}$/.test(v));

    if (vaults.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    const counts = await getCommentCountsByVaults(vaults);
    return NextResponse.json({ counts });
  } catch (e) {
    console.error('GET /api/comments/counts error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
