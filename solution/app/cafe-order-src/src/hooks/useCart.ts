import { useState, useCallback } from 'react';
import type { MenuItem, CartItem } from '../types';

export function useCart() {
  const [items, setItems] = useState<Map<string, CartItem>>(new Map());

  const addItem = useCallback((item: MenuItem) => {
    setItems(prev => {
      const next = new Map(prev);
      const existing = next.get(item.ID);
      next.set(item.ID, { item, qty: (existing?.qty || 0) + 1 });
      return next;
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems(prev => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  const updateQty = useCallback((itemId: string, qty: number) => {
    setItems(prev => {
      const next = new Map(prev);
      if (qty <= 0) { next.delete(itemId); }
      else {
        const existing = next.get(itemId);
        if (existing) next.set(itemId, { ...existing, qty });
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setItems(new Map()), []);

  const cartItems = Array.from(items.values());
  const count = cartItems.reduce((sum, ci) => sum + ci.qty, 0);
  const total = cartItems.reduce((sum, ci) => sum + ci.item.price * ci.qty, 0);

  return { items, cartItems, count, total, addItem, removeItem, updateQty, clear };
}
