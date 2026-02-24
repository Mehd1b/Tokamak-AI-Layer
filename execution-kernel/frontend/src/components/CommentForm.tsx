'use client';

import { useState } from 'react';

interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>;
  isPending: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}

export function CommentForm({ onSubmit, isPending, placeholder = 'Write a comment...', autoFocus = false, onCancel }: CommentFormProps) {
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isPending) return;

    setError(null);
    try {
      await onSubmit(content.trim());
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={2000}
        rows={3}
        className="input-dark resize-none w-full mb-2"
      />
      {error && (
        <p className="text-red-400 text-xs font-mono mb-2">{error}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-gray-600 text-xs font-mono">
          {content.length}/2000
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-500 text-sm hover:text-gray-300 transition-colors px-3 py-1"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!content.trim() || isPending}
            className="btn-primary text-sm"
          >
            {isPending ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  );
}
