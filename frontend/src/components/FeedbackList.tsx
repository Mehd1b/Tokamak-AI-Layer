'use client';

import { Star, MessageSquare, User } from 'lucide-react';
import { type FeedbackEntry } from '@/hooks/useReputation';
import { shortenAddress } from '@/lib/utils';

interface FeedbackListProps {
  feedbacks: FeedbackEntry[];
  isLoading: boolean;
  limit?: number;
}

function ratingFromValue(value: bigint): number {
  // Submitted as rating * 10 (1 star=10, 2=20, ..., 5=50)
  // so divide by 10 to get back to 1-5 stars
  const v = Number(value);
  return Math.max(1, Math.min(5, v / 10));
}

function formatTimestamp(ts: bigint): string {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StarRating({ value }: { value: bigint }) {
  const rating = ratingFromValue(value);
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.25;

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= fullStars
              ? 'fill-yellow-400 text-yellow-400'
              : star === fullStars + 1 && hasHalf
                ? 'fill-yellow-400/50 text-yellow-400'
                : 'text-zinc-700'
          }`}
        />
      ))}
      <span className="ml-1.5 text-xs text-zinc-400">
        {rating.toFixed(rating % 1 === 0 ? 0 : 1)}/5
      </span>
    </div>
  );
}

export function FeedbackList({ feedbacks, isLoading, limit }: FeedbackListProps) {
  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-zinc-500">Loading feedbacks...</p>
      </div>
    );
  }

  if (feedbacks.length === 0) {
    return (
      <div className="py-8 text-center">
        <MessageSquare className="mx-auto mb-2 h-8 w-8 text-zinc-700" />
        <p className="text-sm text-zinc-500">No feedback submitted yet.</p>
      </div>
    );
  }

  const displayed = limit ? feedbacks.slice(0, limit) : feedbacks;

  return (
    <div className="space-y-3">
      {displayed.map((fb, i) => (
        <div
          key={`${fb.client}-${fb.feedbackIndex}-${i}`}
          className="rounded-lg border border-white/10 bg-white/5 p-4"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <StarRating value={fb.value} />
              {fb.tag1 && (
                <span className="mt-2 mr-2 inline-block rounded bg-[#38BDF8]/10 px-2 py-0.5 text-xs font-medium text-[#38BDF8]">
                  {fb.tag1}
                </span>
              )}
              {fb.tag2 && (
                <span className="mt-2 inline-block rounded bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400">
                  {fb.tag2}
                </span>
              )}
              {fb.feedbackURI && (
                <p className="mt-2 text-sm text-zinc-300">{fb.feedbackURI}</p>
              )}
            </div>
            <span className="text-xs text-zinc-600">
              {formatTimestamp(fb.timestamp)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
            <User className="h-3 w-3" />
            {shortenAddress(fb.client)}
          </div>
        </div>
      ))}
    </div>
  );
}
