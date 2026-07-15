import { useState, useEffect, useCallback, useMemo } from 'react';
import { MenuItem, RestockRequest } from '../types';

interface StockStats {
  totalMenuItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingRestocks: number;
}

interface UseStockResult {
  menuItems: MenuItem[];
  restockRequests: RestockRequest[];
  loading: boolean;
  error: string | null;
  stats: StockStats;
  refetch: () => void;
}

export function useStock(): UseStockResult {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [restockRequests, setRestockRequests] = useState<RestockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menuRes, restockRes] = await Promise.all([
        fetch('/api/cafe/Menu'),
        fetch('/api/cafe/RestockRequests'),
      ]);

      if (!menuRes.ok) throw new Error(`Failed to fetch menu: ${menuRes.statusText}`);
      if (!restockRes.ok) throw new Error(`Failed to fetch restocks: ${restockRes.statusText}`);

      const menuData = await menuRes.json();
      const restockData = await restockRes.json();

      setMenuItems(menuData.value ?? menuData);
      setRestockRequests(restockData.value ?? restockData);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo<StockStats>(() => {
    const totalMenuItems = menuItems.length;
    const lowStockCount = menuItems.filter(
      m => m.stockQuantity > 0 && m.stockQuantity <= m.lowStockThreshold
    ).length;
    const outOfStockCount = menuItems.filter(m => m.stockQuantity <= 0).length;
    const pendingRestocks = restockRequests.filter(r => r.status === 'pending').length;
    return { totalMenuItems, lowStockCount, outOfStockCount, pendingRestocks };
  }, [menuItems, restockRequests]);

  return { menuItems, restockRequests, loading, error, stats, refetch: fetchData };
}
