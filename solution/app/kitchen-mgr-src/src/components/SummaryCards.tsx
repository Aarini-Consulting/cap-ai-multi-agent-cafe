import React from 'react';

interface SummaryCardsProps {
  totalMenuItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingRestocks: number;
}

export default function SummaryCards({ totalMenuItems, lowStockCount, outOfStockCount, pendingRestocks }: SummaryCardsProps) {
  return (
    <div className="summary-cards">
      <div className="summary-card">
        <div className="summary-card-label">Menu Items</div>
        <div className="summary-card-value">{totalMenuItems}</div>
      </div>
      <div className={`summary-card ${lowStockCount > 0 ? 'card-warning' : ''}`}>
        <div className="summary-card-label">Low Stock</div>
        <div className="summary-card-value">{lowStockCount}</div>
      </div>
      <div className={`summary-card ${outOfStockCount > 0 ? 'card-danger' : ''}`}>
        <div className="summary-card-label">Out of Stock</div>
        <div className="summary-card-value">{outOfStockCount}</div>
      </div>
      <div className={`summary-card ${pendingRestocks > 0 ? 'card-warning' : ''}`}>
        <div className="summary-card-label">Pending Restocks</div>
        <div className="summary-card-value">{pendingRestocks}</div>
      </div>
    </div>
  );
}
