import { useState, useEffect, useCallback, useMemo } from 'react';
import { Feedback } from '../types';

interface SummaryStats {
  totalCount: number;
  openCount: number;
  resolvedCount: number;
  avgRating: number;
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

interface UseFeedbackResult {
  feedbacks: Feedback[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  summary: SummaryStats;
}

export function useFeedback(): UseFeedbackResult {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cafe/CustomerFeedback');
      if (!res.ok) throw new Error(`Failed to fetch feedback: ${res.statusText}`);
      const data = await res.json();
      setFeedbacks(data.value ?? data);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const summary = useMemo<SummaryStats>(() => {
    const totalCount = feedbacks.length;
    const openCount = feedbacks.filter(f => f.status === 'open').length;
    const resolvedCount = feedbacks.filter(f => f.status === 'resolved').length;
    const avgRating = totalCount > 0
      ? feedbacks.reduce((sum, f) => sum + (f.rating ?? 0), 0) / totalCount
      : 0;
    const sentimentBreakdown = {
      positive: feedbacks.filter(f => f.sentiment === 'positive').length,
      negative: feedbacks.filter(f => f.sentiment === 'negative').length,
      neutral: feedbacks.filter(f => f.sentiment === 'neutral').length,
    };
    return { totalCount, openCount, resolvedCount, avgRating, sentimentBreakdown };
  }, [feedbacks]);

  return { feedbacks, loading, error, refetch: fetchFeedbacks, summary };
}
