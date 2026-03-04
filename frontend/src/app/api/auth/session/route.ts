import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();

    if (!session.address) {
      return NextResponse.json({ address: null });
    }

    return NextResponse.json({ address: session.address });
  } catch (e) {
    console.error('GET /api/auth/session error:', e);
    return NextResponse.json({ address: null });
  }
}
