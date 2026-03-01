import { NextRequest, NextResponse } from 'next/server';
import { softDeleteComment, getCommentById, pinComment, unpinComment } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session.address) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const comment = await getCommentById(id);
    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (comment.author !== session.address.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const deleted = await softDeleteComment(id, session.address);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/comments/[id] error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session.address) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const { action } = await req.json();

    if (action !== 'pin' && action !== 'unpin') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const comment = await getCommentById(id);
    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Verify caller is the vault owner (passed via header from the client)
    const vaultOwner = req.headers.get('x-vault-owner');
    if (!vaultOwner || session.address.toLowerCase() !== vaultOwner.toLowerCase()) {
      return NextResponse.json({ error: 'Only the vault owner can pin comments' }, { status: 403 });
    }

    let ok: boolean;
    if (action === 'pin') {
      ok = await pinComment(id, comment.vault);
    } else {
      ok = await unpinComment(id, comment.vault);
    }

    if (!ok) {
      return NextResponse.json({ error: `Failed to ${action} comment` }, { status: 500 });
    }

    const updated = await getCommentById(id);
    return NextResponse.json({ comment: updated });
  } catch (e) {
    console.error('PATCH /api/comments/[id] error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
