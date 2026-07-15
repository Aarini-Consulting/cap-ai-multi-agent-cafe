import { useState, useEffect, useCallback } from 'react';
import type { MenuItem, Screen, Order } from './types';
import { useCart } from './hooks/useCart';
import ChatScreen from './screens/ChatScreen';
import FilterScreen from './screens/FilterScreen';
import ReviewScreen from './screens/ReviewScreen';
import TrackScreen from './screens/TrackScreen';
import FeedbackScreen from './screens/FeedbackScreen';

export default function App() {
  const [screen, setScreen] = useState<Screen>('chat');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [filterConstraint, setFilterConstraint] = useState('');
  const [filterResults, setFilterResults] = useState<Array<{item: MenuItem; reason: string}>>([]);
  const cart = useCart();

  useEffect(() => {
    fetch('/api/cafe/Menu')
      .then(res => res.json())
      .then(data => setMenuItems(data.value || []))
      .catch(console.error);
  }, []);

  const cartQty = useCallback((id: string) => {
    const ci = cart.items.get(id);
    return ci?.qty || 0;
  }, [cart.items]);

  // After placing order, trigger kitchen stock check in background
  async function triggerStockCheck() {
    try {
      console.log('[stock-check] Triggering kitchen agent for stock evaluation...');
      await fetch('/api/cafe/invokeAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Check if any items are running low on stock after recent orders. If any items are out of stock or critically low, create restock requests.',
        }),
      });
      console.log('[stock-check] Kitchen agent notified.');
    } catch (e) {
      console.log('[stock-check] Background stock check failed (non-critical):', e);
    }
  }

  async function handlePlaceOrder(): Promise<Order | null> {
    if (cart.cartItems.length === 0) return null;
    try {
      const orderItems = cart.cartItems.map(ci => ({
        itemId: ci.item.ID,
        quantity: ci.qty,
      }));
      const res = await fetch('/api/cafe/placeOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: orderItems }),
      });
      if (!res.ok) throw new Error('Order failed');
      const data = await res.json();
      const newOrder = data as Order;
      setOrder(newOrder);
      cart.clear();

      // Background: ask kitchen agent to evaluate stock after this order
      triggerStockCheck();

      return newOrder;
    } catch (e) {
      console.error('Place order failed:', e);
      return null;
    }
  }

  void filterConstraint;
  void filterResults;
  void setFilterConstraint;
  void setFilterResults;

  return (
    <div className="app-shell">
      {screen === 'chat' && (
        <ChatScreen
          menuItems={menuItems}
          cartCount={cart.count}
          cartTotal={cart.total}
          cartQty={cartQty}
          onAddItem={cart.addItem}
          onRemoveItem={cart.removeItem}
          onNavigate={setScreen}
        />
      )}
      {screen === 'filter' && (
        <FilterScreen
          constraint={filterConstraint}
          results={filterResults}
          cartCount={cart.count}
          cartTotal={cart.total}
          cartQty={cartQty}
          onAddItem={cart.addItem}
          onRemoveItem={cart.removeItem}
          onNavigate={setScreen}
        />
      )}
      {screen === 'review' && (
        <ReviewScreen
          cartItems={cart.cartItems}
          total={cart.total}
          onUpdateQty={cart.updateQty}
          onNavigate={setScreen}
          onPlaceOrder={handlePlaceOrder}
        />
      )}
      {screen === 'track' && (
        <TrackScreen
          order={order}
          onNavigate={setScreen}
        />
      )}
      {screen === 'feedback' && (
        <FeedbackScreen
          order={order}
          onNavigate={setScreen}
        />
      )}
    </div>
  );
}
