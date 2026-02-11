'use client';

import { useState } from 'react';
import { X, Star, Loader2, CheckCircle } from 'lucide-react';
import { useSubmitFeedback } from '@/hooks/useSubmitFeedback';
import { useWallet } from '@/hooks/useWallet';
import { useHasUsedAgent } from '@/hooks/useTaskFee';
import { useL2Config } from '@/hooks/useL2Config';

interface FeedbackModalProps {
  agentId: bigint;
  agentOwner: string;
  onClose: () => void;
}

const CATEGORIES = ['Quality', 'Speed', 'Accuracy', 'Reliability', 'Value'];

export function FeedbackModal({ agentId, agentOwner, onClose }: FeedbackModalProps) {
  const { explorerUrl } = useL2Config();
  const { address } = useWallet();
  const { submitFeedback, hash, isPending, isConfirming, isSuccess, error } =
    useSubmitFeedback();
  const { data: hasUsed } = useHasUsedAgent(agentId, address as `0x${string}` | undefined);

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState('Quality');
  const [comment, setComment] = useState('');

  const isSelfFeedback =
    address?.toLowerCase() === agentOwner?.toLowerCase();
  const hasNotUsedAgent = hasUsed === false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0 || isSelfFeedback) return;
    submitFeedback({ agentId, rating, category, comment });
  };

  // Success state
  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#13131a] p-6 shadow-2xl">
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              Feedback Submitted!
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              Your {rating}-star feedback has been recorded on-chain.
            </p>
            {hash && (
              <a
                href={`${explorerUrl}/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-[#38BDF8] underline"
              >
                View transaction
              </a>
            )}
            <button onClick={onClose} className="btn-primary mt-6 w-full">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#13131a] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Submit Feedback
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isSelfFeedback && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-400">
              You cannot submit feedback for your own agent.
            </p>
          </div>
        )}

        {!isSelfFeedback && hasNotUsedAgent && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-400">
              You must complete at least one task with this agent before submitting feedback.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Star Rating */}
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Rating
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1"
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= (hoverRating || rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-zinc-600'
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 flex items-center text-sm text-zinc-500">
                  {rating}/5
                </span>
              )}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Comment */}
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Comment (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Share your experience with this agent..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
            />
            <p className={`mt-1 text-xs text-right ${comment.length > 450 ? 'text-red-400' : 'text-zinc-500'}`}>
              {comment.length}/500
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">
                {error.message?.includes('self-feedback')
                  ? 'You cannot submit feedback for your own agent.'
                  : error.message?.includes('NotAgentUser')
                    ? 'You must complete a task with this agent before submitting feedback.'
                    : error.message?.substring(0, 150) || 'Transaction failed'}
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                rating === 0 ||
                isPending ||
                isConfirming ||
                isSelfFeedback ||
                hasNotUsedAgent
              }
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirm in wallet...
                </>
              ) : isConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Feedback'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
