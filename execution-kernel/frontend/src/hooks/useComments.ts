'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Comment {
  id: string;
  vault: string;
  author: string;
  content: string;
  parent_id: string | null;
  created_at: number;
  deleted: number;
}

export function useComments(vault: string) {
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading, error } = useQuery({
    queryKey: ['comments', vault],
    queryFn: async () => {
      const res = await fetch(`/api/comments?vault=${vault}`);
      if (!res.ok) throw new Error('Failed to fetch comments');
      const data = await res.json();
      return data.comments as Comment[];
    },
    enabled: !!vault,
    refetchInterval: 30_000,
  });

  const addComment = useMutation({
    mutationFn: async (params: { content: string; parentId?: string }) => {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vault,
          content: params.content,
          parentId: params.parentId || null,
        }),
      });
      if (!res.ok) {
        let message = 'Failed to post comment';
        try {
          const err = await res.json();
          message = err.error || message;
        } catch {
          // Response body is empty or not JSON
        }
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', vault] });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
      if (!res.ok) {
        let message = 'Failed to delete comment';
        try {
          const err = await res.json();
          message = err.error || message;
        } catch {
          // Response body is empty or not JSON
        }
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', vault] });
    },
  });

  return {
    comments,
    isLoading,
    error,
    addComment: addComment.mutateAsync,
    addCommentPending: addComment.isPending,
    addCommentError: addComment.error,
    deleteComment: deleteComment.mutateAsync,
    deleteCommentPending: deleteComment.isPending,
  };
}
