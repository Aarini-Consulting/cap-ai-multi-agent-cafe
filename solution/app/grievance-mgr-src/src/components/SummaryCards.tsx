import React from 'react';

interface SummaryCardsProps {
  totalCount: number;
  openCount: number;
  avgRating: number;
  negativePercent: number;
}

function renderStars(rating: number): string {
  const full = Math.round(rating);
  return '\u2605'.repeat(full) + '\u2606'.repeat(5 - full);
}

export default function SummaryCards({ totalCount, openCount, avgRating, negativePercent }: SummaryCardsProps) {
  return (
    <div className="summary-cards">
      <div className="summary-card">
        <div className="summary-card-label">Total Complaints</div>
        <div className="summary-card-value">{totalCount}</div>
      </div>
      <div className={`summary-card ${openCount > 0 ? 'card-warning' : ''}`}>
        <div className="summary-card-label">Open</div>
        <div className="summary-card-value">{openCount}</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-label">Avg Rating</div>
        <div className="summary-card-value summary-stars">
          {renderStars(avgRating)}
          <span className="summary-rating-num">{avgRating.toFixed(1)}</span>
        </div>
      </div>
      <div className={`summary-card ${negativePercent > 30 ? 'card-danger' : ''}`}>
        <div className="summary-card-label">Negative %</div>
        <div className="summary-card-value">{negativePercent.toFixed(0)}%</div>
      </div>
    </div>
  );
}
