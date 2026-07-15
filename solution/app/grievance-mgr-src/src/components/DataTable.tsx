import React, { useState, useMemo } from 'react';
import { Feedback } from '../types';

interface DataTableProps {
  feedbacks: Feedback[];
  loading: boolean;
  filter: { status?: string; sentiment?: string; rating?: number };
  onFilterChange: (filter: { status?: string; sentiment?: string; rating?: number }) => void;
  onResolve: (id: string) => void;
}

type SortKey = 'rating' | 'sentiment' | 'status' | 'createdAt';
type SortDir = 'asc' | 'desc';

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function renderStars(rating: number): string {
  return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating);
}

export default function DataTable({ feedbacks, loading, filter, onFilterChange, onResolve }: DataTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    let result = [...feedbacks];
    if (filter.status && filter.status !== 'all') {
      result = result.filter(f => f.status === filter.status);
    }
    if (filter.sentiment && filter.sentiment !== 'all') {
      result = result.filter(f => f.sentiment === filter.sentiment);
    }
    if (filter.rating) {
      result = result.filter(f => f.rating === filter.rating);
    }
    return result;
  }, [feedbacks, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'rating': cmp = a.rating - b.rating; break;
        case 'sentiment': cmp = a.sentiment.localeCompare(b.sentiment); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'createdAt': cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ' \u2195';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const resetFilters = () => {
    onFilterChange({});
  };

  const hasActiveFilters = filter.status || filter.sentiment || filter.rating;

  return (
    <div className="data-table-container">
      <div className="data-table-header">
        <h2>Customer Feedback ({filtered.length})</h2>
        <div className="data-table-controls">
          {hasActiveFilters && (
            <button className="reset-filters-btn" onClick={resetFilters}>Reset Filters</button>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <label>
          Status
          <select
            value={filter.status ?? 'all'}
            onChange={e => onFilterChange({ ...filter, status: e.target.value === 'all' ? undefined : e.target.value })}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label>
          Sentiment
          <select
            value={filter.sentiment ?? 'all'}
            onChange={e => onFilterChange({ ...filter, sentiment: e.target.value === 'all' ? undefined : e.target.value })}
          >
            <option value="all">All</option>
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>
        <label>
          Rating
          <select
            value={filter.rating ?? ''}
            onChange={e => onFilterChange({ ...filter, rating: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">All</option>
            <option value="1">1 Star</option>
            <option value="2">2 Stars</option>
            <option value="3">3 Stars</option>
            <option value="4">4 Stars</option>
            <option value="5">5 Stars</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="table-empty-state">Loading feedback data...</div>
      ) : sorted.length === 0 ? (
        <div className="table-empty-state">
          <div className="empty-icon">&#128203;</div>
          <p>No feedback found matching your filters.</p>
          {hasActiveFilters && (
            <button className="reset-filters-btn" onClick={resetFilters}>Clear Filters</button>
          )}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-checkbox"><input type="checkbox" disabled /></th>
                <th className="col-id">ID</th>
                <th className="col-sortable" onClick={() => handleSort('rating')}>
                  Rating{sortIndicator('rating')}
                </th>
                <th className="col-sortable" onClick={() => handleSort('sentiment')}>
                  Sentiment{sortIndicator('sentiment')}
                </th>
                <th className="col-sortable" onClick={() => handleSort('status')}>
                  Status{sortIndicator('status')}
                </th>
                <th className="col-comment">Comment</th>
                <th className="col-sortable" onClick={() => handleSort('createdAt')}>
                  Created{sortIndicator('createdAt')}
                </th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(fb => (
                <tr key={fb.ID}>
                  <td className="col-checkbox"><input type="checkbox" disabled /></td>
                  <td className="col-id mono">{fb.ID.substring(0, 8)}</td>
                  <td className="col-rating">
                    <span className="stars">{renderStars(fb.rating)}</span>
                  </td>
                  <td>
                    <span className={`badge sentiment-${fb.sentiment}`}>{fb.sentiment}</span>
                  </td>
                  <td>
                    <span className={`badge status-${fb.status}`}>{fb.status}</span>
                  </td>
                  <td className="col-comment" title={fb.comment}>
                    {fb.comment && fb.comment.length > 60 ? fb.comment.substring(0, 60) + '...' : fb.comment}
                  </td>
                  <td className="col-date">{fb.createdAt ? relativeTime(fb.createdAt) : '-'}</td>
                  <td className="col-actions">
                    {fb.status === 'open' && (
                      <button className="resolve-btn" onClick={() => onResolve(fb.ID)}>
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
