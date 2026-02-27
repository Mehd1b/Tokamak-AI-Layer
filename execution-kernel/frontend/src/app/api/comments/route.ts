import { NextRequest, NextResponse } from 'next/server';
import { getCommentsByVault, createComment, countRecentComments, getCommentById } from '@/lib/db';
import { getSession } from '@/lib/session';
import crypto from 'crypto';

const MAX_CONTENT_LENGTH = 2000;
const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 10; // max comments per window

export async function GET(req: NextRequest) {
  try {
    const vault = req.nextUrl.searchParams.get('vault');

    if (!vault || !/^0x[0-9a-fA-F]{40}$/.test(vault)) {
      return NextResponse.json({ error: 'Invalid vault address' }, { status: 400 });
    }

    const comments = getCommentsByVault(vault);
    return NextResponse.json({ comments });
  } catch (e) {
    console.error('GET /api/comments error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.address) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { vault, content, parentId } = await req.json();

    if (!vault || !/^0x[0-9a-fA-F]{40}$/.test(vault)) {
      return NextResponse.json({ error: 'Invalid vault address' }, { status: 400 });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` }, { status: 400 });
    }

    // Validate parentId if provided
    if (parentId) {
      const parent = getCommentById(parentId);
      if (!parent || parent.deleted) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 400 });
      }
      if (parent.vault !== vault.toLowerCase()) {
        return NextResponse.json({ error: 'Parent comment belongs to a different vault' }, { status: 400 });
      }
    }

    // Rate limiting
    const recentCount = countRecentComments(session.address, RATE_LIMIT_WINDOW);
    if (recentCount >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 });
    }

    const comment = createComment({
      id: crypto.randomUUID(),
      vault,
      author: session.address,
      content: content.trim(),
      parentId: parentId || null,
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (e) {
    console.error('POST /api/comments error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
