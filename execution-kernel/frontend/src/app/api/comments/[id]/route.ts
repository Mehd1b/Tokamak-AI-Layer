import { NextRequest, NextResponse } from 'next/server';
import { softDeleteComment, getCommentById } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

  if (!session.address) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  const comment = getCommentById(id);
  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  if (comment.author !== session.address.toLowerCase()) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const deleted = softDeleteComment(id, session.address);

  if (!deleted) {
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
