import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

export async function POST(request: NextRequest) {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return NextResponse.json(
      { error: 'IPFS service not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY.' },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Only PNG and JPG images are allowed.' },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Maximum size is 5MB.' },
      { status: 413 },
    );
  }

  try {
    const pinataForm = new FormData();
    pinataForm.append('file', file);
    pinataForm.append(
      'pinataMetadata',
      JSON.stringify({ name: `TAL Agent Image: ${file.name}` }),
    );

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        pinata_api_key: apiKey,
        pinata_secret_api_key: secretKey,
      },
      body: pinataForm,
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `Pinata upload failed: ${err}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`;

    return NextResponse.json({
      ipfsUri: `ipfs://${data.IpfsHash}`,
      cid: data.IpfsHash,
      gatewayUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Image upload error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 },
    );
  }
}
