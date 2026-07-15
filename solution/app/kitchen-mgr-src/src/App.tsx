import React, { useState, useCallback } from 'react';
import ChatPanel from './components/ChatPanel';
import SummaryCards from './components/SummaryCards';
import DataTable from './components/DataTable';
import { useStock } from './hooks/useStock';
import { useKitchenAgent } from './hooks/useKitchenAgent';

export default function App() {
  const { menuItems, restockRequests, loading, stats, refetch } = useStock();
  const { messages, isLoading, sendMessage } = useKitchenAgent();
  const [activeView, setActiveView] = useState<'stock' | 'restocks'>('stock');

  const handleFilterFromChat = useCallback((filter: { view?: string; stockFilter?: string }) => {
    if (filter.view === 'restocks') {
      setActiveView('restocks');
    } else if (filter.view === 'stock') {
      setActiveView('stock');
    }
  }, []);

  const handleRestock = useCallback(async (itemId: string, itemName: string) => {
    try {
      const res = await fetch('/api/cafe/createRestockRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity: 20, urgency: 'normal', notes: `Restock for ${itemName}` }),
      });
      if (!res.ok) throw new Error('Failed to create restock request');
      refetch();
      sendMessage(`I just created a restock request for ${itemName}. Please note this.`);
    } catch (err) {
      console.error('Failed to create restock request:', err);
    }
  }, [refetch, sendMessage]);

  const handleFulfill = useCallback(async (requestId: string) => {
    try {
      const res = await fetch('/api/cafe/fulfillRestockRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      if (!res.ok) throw new Error('Failed to fulfill restock request');
      refetch();
      sendMessage(`I just fulfilled restock request ${requestId.substring(0, 8)}. Please update your records.`);
    } catch (err) {
      console.error('Failed to fulfill restock request:', err);
    }
  }, [refetch, sendMessage]);

  return (
    <div className="app-layout">
      <div className="app-topbar">
        <div className="app-icon">👨‍🍳</div>
        <h1>Kitchen Manager</h1>
        <span className="app-sub">Stock levels & restock operations</span>
        <div className="spacer" />
        {stats.outOfStockCount > 0 && (
          <span className="badge badge-red">{stats.outOfStockCount} out of stock</span>
        )}
        {stats.lowStockCount > 0 && (
          <span className="badge badge-amber">{stats.lowStockCount} low stock</span>
        )}
        {stats.pendingRestocks > 0 && (
          <span className="badge badge-blue">{stats.pendingRestocks} pending</span>
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
            totalMenuItems={stats.totalMenuItems}
            lowStockCount={stats.lowStockCount}
            outOfStockCount={stats.outOfStockCount}
            pendingRestocks={stats.pendingRestocks}
          />
          <DataTable
            menuItems={menuItems}
            restockRequests={restockRequests}
            loading={loading}
            activeView={activeView}
            onViewChange={setActiveView}
            onRestock={handleRestock}
            onFulfill={handleFulfill}
          />
        </div>
      </div>
    </div>
  );
}
