'use client';

import { useState } from 'react';
import { truncateAddress } from '@/lib/utils';
import type { Comment } from '@/hooks/useComments';

interface CommentCardProps {
  comment: Comment;
  currentUser: string | null;
  onReply: (parentId: string) => void;
  onDelete: (commentId: string) => Promise<void>;
  deletePending: boolean;
}

export function CommentCard({ comment, currentUser, onReply, onDelete, deletePending }: CommentCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isOwner = currentUser?.toLowerCase() === comment.author.toLowerCase();

  const timeAgo = getTimeAgo(comment.created_at);

  return (
    <div className="group">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-mono"
          style={{
            background: `linear-gradient(135deg, ${addressToColor(comment.author)}, ${addressToColor(comment.author, 40)})`,
          }}
        >
          {comment.author.slice(2, 4).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[#C084FC] text-sm font-mono">
              {truncateAddress(comment.author, 4)}
            </span>
            <span className="text-gray-600 text-xs font-mono">{timeAgo}</span>
          </div>

          {/* Content */}
          <p className="text-gray-300 text-sm whitespace-pre-wrap break-words">
            {comment.content}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onReply(comment.id)}
              className="text-gray-500 text-xs hover:text-[#C084FC] transition-colors"
            >
              Reply
            </button>
            {isOwner && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-gray-500 text-xs hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            )}
            {isOwner && confirmDelete && (
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await onDelete(comment.id);
                    setConfirmDelete(false);
                  }}
                  disabled={deletePending}
                  className="text-red-400 text-xs hover:text-red-300 transition-colors"
                >
                  {deletePending ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-gray-500 text-xs hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

function addressToColor(address: string, offset = 0): string {
  const hash = parseInt(address.slice(2, 8), 16) + offset;
  const h = hash % 360;
  return `hsl(${h}, 60%, 40%)`;
}
