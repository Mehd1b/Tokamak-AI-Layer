import { NextRequest, NextResponse } from 'next/server';

const MAX_PAYLOAD_SIZE = 1_000_000; // 1MB in bytes

export async function POST(request: NextRequest) {
  // Parse JSON with error handling
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate payload size
  const payloadSize = JSON.stringify(body).length;
  if (payloadSize > MAX_PAYLOAD_SIZE) {
    return NextResponse.json(
      { error: `Payload too large. Maximum size is ${MAX_PAYLOAD_SIZE} bytes.` },
      { status: 413 },
    );
  }

  // Validate ERC-8004 schema: require name field
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json(
      { error: 'Invalid schema: "name" field is required and must be a non-empty string' },
      { status: 400 },
    );
  }

  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return NextResponse.json(
      { error: 'IPFS service not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY.' },
      { status: 500 },
    );
  }

  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        pinata_api_key: apiKey,
        pinata_secret_api_key: secretKey,
      },
      body: JSON.stringify({
        pinataContent: body,
        pinataMetadata: { name: `TAL Agent: ${body.name || 'Unknown'}` },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `Pinata upload failed: ${err}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json({ ipfsUri: `ipfs://${data.IpfsHash}`, cid: data.IpfsHash });
  } catch (err) {
    return NextResponse.json(
      { error: `IPFS upload error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 },
    );
  }
}
