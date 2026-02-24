import { NextRequest, NextResponse } from 'next/server';
import { SiweMessage } from 'siwe';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    if (!message || !signature) {
      return NextResponse.json({ error: 'Missing message or signature' }, { status: 400 });
    }

    const session = await getSession();

    // Capture and immediately clear the nonce to prevent replay attacks
    const nonce = session.nonce;
    if (!nonce) {
      return NextResponse.json({ error: 'No nonce in session' }, { status: 400 });
    }
    session.nonce = undefined;
    await session.save();

    const siweMessage = new SiweMessage(message);
    const { data: fields } = await siweMessage.verify({
      signature,
      nonce,
    });

    session.address = fields.address;
    await session.save();

    return NextResponse.json({ address: fields.address });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
}
