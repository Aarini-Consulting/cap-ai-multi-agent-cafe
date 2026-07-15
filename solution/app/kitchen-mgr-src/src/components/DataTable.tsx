import React, { useState, useMemo } from 'react';
import { MenuItem, RestockRequest } from '../types';

interface DataTableProps {
  menuItems: MenuItem[];
  restockRequests: RestockRequest[];
  loading: boolean;
  activeView: 'stock' | 'restocks';
  onViewChange: (view: 'stock' | 'restocks') => void;
  onRestock: (itemId: string, itemName: string) => void;
  onFulfill: (requestId: string) => void;
}

function getStockStatus(item: MenuItem): 'ok' | 'low' | 'out' {
  if (item.stockQuantity <= 0) return 'out';
  if (item.stockQuantity <= item.lowStockThreshold) return 'low';
  return 'ok';
}

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

export default function DataTable({
  menuItems,
  restockRequests,
  loading,
  activeView,
  onViewChange,
  onRestock,
  onFulfill,
}: DataTableProps) {
  const [stockSort, setStockSort] = useState<'name' | 'stockQuantity' | 'category'>('name');
  const [stockDir, setStockDir] = useState<'asc' | 'desc'>('asc');

  const handleStockSort = (key: 'name' | 'stockQuantity' | 'category') => {
    if (stockSort === key) {
      setStockDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setStockSort(key);
      setStockDir('asc');
    }
  };

  const sortedMenu = useMemo(() => {
    return [...menuItems].sort((a, b) => {
      let cmp = 0;
      switch (stockSort) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'stockQuantity': cmp = a.stockQuantity - b.stockQuantity; break;
        case 'category': cmp = (a.category ?? '').localeCompare(b.category ?? ''); break;
      }
      return stockDir === 'asc' ? cmp : -cmp;
    });
  }, [menuItems, stockSort, stockDir]);

  const sortIndicator = (key: string, currentKey: string, dir: 'asc' | 'desc') => {
    if (currentKey !== key) return ' \u2195';
    return dir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const pendingRestocks = useMemo(() => {
    return restockRequests.filter(r => r.status === 'pending');
  }, [restockRequests]);

  return (
    <div className="data-table-container">
      <div className="data-table-header">
        <div className="tab-switcher">
          <button
            className={`tab-btn ${activeView === 'stock' ? 'active' : ''}`}
            onClick={() => onViewChange('stock')}
          >
            Stock ({menuItems.length})
          </button>
          <button
            className={`tab-btn ${activeView === 'restocks' ? 'active' : ''}`}
            onClick={() => onViewChange('restocks')}
          >
            Restocks ({pendingRestocks.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="table-empty-state">Loading kitchen data...</div>
      ) : activeView === 'stock' ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-sortable" onClick={() => handleStockSort('name')}>
                  Name{sortIndicator('name', stockSort, stockDir)}
                </th>
                <th className="col-sortable" onClick={() => handleStockSort('category')}>
                  Category{sortIndicator('category', stockSort, stockDir)}
                </th>
                <th className="col-sortable" onClick={() => handleStockSort('stockQuantity')}>
                  Stock Qty{sortIndicator('stockQuantity', stockSort, stockDir)}
                </th>
                <th>Threshold</th>
                <th>Status</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedMenu.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                    No menu items found.
                  </td>
                </tr>
              ) : (
                sortedMenu.map(item => {
                  const status = getStockStatus(item);
                  return (
                    <tr key={item.ID}>
                      <td style={{ fontWeight: 500 }}>{item.name}</td>
                      <td><span className="badge badge-category">{item.category}</span></td>
                      <td style={{ fontFamily: 'monospace' }}>{item.stockQuantity}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{item.lowStockThreshold}</td>
                      <td>
                        <span className={`badge stock-${status}`}>
                          {status === 'ok' ? 'OK' : status === 'low' ? 'Low' : 'Out'}
                        </span>
                      </td>
                      <td className="col-actions">
                        {status !== 'ok' && (
                          <button
                            className="resolve-btn"
                            onClick={() => onRestock(item.ID, item.name)}
                          >
                            Restock
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Quantity</th>
                <th>Urgency</th>
                <th>Status</th>
                <th>Requested</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {restockRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                    No restock requests found.
                  </td>
                </tr>
              ) : (
                restockRequests.map(req => {
                  const itemName = menuItems.find(m => m.ID === req.item_ID)?.name ?? req.item_ID?.substring(0, 8) ?? '-';
                  return (
                    <tr key={req.ID}>
                      <td className="mono">{req.ID.substring(0, 8)}</td>
                      <td style={{ fontWeight: 500 }}>{itemName}</td>
                      <td style={{ fontFamily: 'monospace' }}>{req.quantity}</td>
                      <td>
                        <span className={`badge urgency-${req.urgency}`}>{req.urgency}</span>
                      </td>
                      <td>
                        <span className={`badge restock-${req.status}`}>{req.status}</span>
                      </td>
                      <td className="col-date">
                        {req.requestedAt ? relativeTime(req.requestedAt) : '-'}
                      </td>
                      <td className="col-actions">
                        {req.status === 'pending' && (
                          <button
                            className="resolve-btn"
                            onClick={() => onFulfill(req.ID)}
                          >
                            Fulfill
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
