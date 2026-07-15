import React, { useState, useCallback } from 'react';
import ChatPanel from './components/ChatPanel';
import SummaryCards from './components/SummaryCards';
import DataTable from './components/DataTable';
import { useFeedback } from './hooks/useFeedback';
import { useGrievanceAgent } from './hooks/useGrievanceAgent';

interface FilterState {
  status?: string;
  sentiment?: string;
  rating?: number;
}

export default function App() {
  const { feedbacks, loading, summary, refetch } = useFeedback();
  const { messages, isLoading, sendMessage } = useGrievanceAgent();
  const [filter, setFilter] = useState<FilterState>({});

  const handleFilterFromChat = useCallback((chatFilter: { status?: string; sentiment?: string }) => {
    setFilter(prev => ({ ...prev, ...chatFilter }));
  }, []);

  const handleResolve = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/cafe/resolveComplaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaintId: id }),
      });
      if (!res.ok) throw new Error('Failed to resolve complaint');
      refetch();
      sendMessage(`I just resolved complaint ${id.substring(0, 8)}. Please update your records.`);
    } catch (err) {
      console.error('Failed to resolve complaint:', err);
    }
  }, [refetch, sendMessage]);

  const negativePercent = summary.totalCount > 0
    ? (summary.sentimentBreakdown.negative / summary.totalCount) * 100
    : 0;

  return (
    <div className="app-layout">
      <div className="app-topbar">
        <div className="app-icon">🤝</div>
        <h1>Grievance Manager</h1>
        <span className="app-sub">Customer feedback & complaint resolution</span>
        <div className="spacer" />
        {summary.openCount > 0 && (
          <span className="badge badge-red">{summary.openCount} open</span>
        )}
        {summary.resolvedCount > 0 && (
          <span className="badge badge-green">{summary.resolvedCount} resolved</span>
        )}
      </div>
      <div className="app-body">
        <div className="panel-left">
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            onSend={sendMessage}
            onFilter={handleFilterFromChat}
          />
        </div>
        <div className="panel-right">
          <SummaryCards
            totalCount={summary.totalCount}
            openCount={summary.openCount}
            avgRating={summary.avgRating}
            negativePercent={negativePercent}
          />
          <DataTable
            feedbacks={feedbacks}
            loading={loading}
            filter={filter}
            onFilterChange={setFilter}
            onResolve={handleResolve}
          />
        </div>
      </div>
    </div>
  );
}
