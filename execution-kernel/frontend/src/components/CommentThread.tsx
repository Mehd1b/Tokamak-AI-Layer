'use client';

import { CommentCard } from './CommentCard';
import { CommentForm } from './CommentForm';
import type { Comment } from '@/hooks/useComments';

interface CommentThreadProps {
  comments: Comment[];
  allComments: Comment[];
  currentUser: string | null;
  replyingTo: string | null;
  onReply: (parentId: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (content: string, parentId: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  replyPending: boolean;
  deletePending: boolean;
  depth?: number;
}

const MAX_DEPTH = 4;

export function CommentThread({
  comments,
  allComments,
  currentUser,
  replyingTo,
  onReply,
  onCancelReply,
  onSubmitReply,
  onDelete,
  replyPending,
  deletePending,
  depth = 0,
}: CommentThreadProps) {
  return (
    <div className={depth > 0 ? 'ml-6 pl-4 border-l border-white/5' : ''}>
      {comments.map((comment) => {
        const replies = allComments.filter((c) => c.parent_id === comment.id);

        return (
          <div key={comment.id} className="py-3">
            <CommentCard
              comment={comment}
              currentUser={currentUser}
              onReply={depth < MAX_DEPTH ? onReply : () => {}}
              onDelete={onDelete}
              deletePending={deletePending}
            />

            {/* Inline reply form */}
            {replyingTo === comment.id && (
              <div className="ml-11 mt-3">
                <CommentForm
                  onSubmit={(content) => onSubmitReply(content, comment.id)}
                  isPending={replyPending}
                  placeholder={`Reply to ${comment.author.slice(0, 6)}...`}
                  autoFocus
                  onCancel={onCancelReply}
                />
              </div>
            )}

            {/* Nested replies */}
            {replies.length > 0 && (
              <CommentThread
                comments={replies}
                allComments={allComments}
                currentUser={currentUser}
                replyingTo={replyingTo}
                onReply={onReply}
                onCancelReply={onCancelReply}
                onSubmitReply={onSubmitReply}
                onDelete={onDelete}
                replyPending={replyPending}
                deletePending={deletePending}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
