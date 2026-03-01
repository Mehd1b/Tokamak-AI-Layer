'use client';

import { useState } from 'react';
import { useComments } from '@/hooks/useComments';
import { useSiweAuth } from '@/hooks/useSiweAuth';
import { SiweAuthButton } from './SiweAuthButton';
import { CommentForm } from './CommentForm';
import { CommentThread } from './CommentThread';

interface CommentSectionProps {
  vaultAddress: string;
  vaultOwner?: string;
}

export function CommentSection({ vaultAddress, vaultOwner }: CommentSectionProps) {
  const { comments, isLoading, addComment, addCommentPending, deleteComment, deleteCommentPending, pinComment, unpinComment } = useComments(vaultAddress, vaultOwner);
  const { isSignedIn, session } = useSiweAuth();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const topLevelComments = comments.filter((c) => !c.parent_id);

  const handleSubmit = async (content: string) => {
    await addComment({ content });
  };

  const handleReply = async (content: string, parentId: string) => {
    await addComment({ content, parentId });
    setReplyingTo(null);
  };

  const handleDelete = async (commentId: string) => {
    await deleteComment(commentId);
  };

  const handlePin = async (commentId: string) => {
    await pinComment(commentId);
  };

  const handleUnpin = async (commentId: string) => {
    await unpinComment(commentId);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
          Discussion
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-gray-600 text-xs font-mono">
            {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </span>
          <SiweAuthButton />
        </div>
      </div>

      {/* New comment form */}
      {isSignedIn && (
        <div className="mb-6">
          <CommentForm
            onSubmit={handleSubmit}
            isPending={addCommentPending}
          />
        </div>
      )}

      {/* Comments list */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-white/5" />
              <div className="flex-1">
                <div className="h-4 bg-white/5 rounded w-24 mb-2" />
                <div className="h-3 bg-white/5 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : topLevelComments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm font-mono">
            No comments yet. Be the first to start a discussion.
          </p>
        </div>
      ) : (
        <CommentThread
          comments={topLevelComments}
          allComments={comments}
          currentUser={session || null}
          vaultOwner={vaultOwner}
          replyingTo={replyingTo}
          onReply={setReplyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSubmitReply={handleReply}
          onDelete={handleDelete}
          onPin={handlePin}
          onUnpin={handleUnpin}
          replyPending={addCommentPending}
          deletePending={deleteCommentPending}
        />
      )}
    </div>
  );
}
