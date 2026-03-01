import { NextResponse } from 'next/server';
import { generateNonce } from 'siwe';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();
    const nonce = generateNonce();
    session.nonce = nonce;
    await session.save();
    return NextResponse.json({ nonce });
  } catch (e) {
    console.error('GET /api/auth/nonce error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
