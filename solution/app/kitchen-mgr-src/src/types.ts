export interface MenuItem {
  ID: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  dietary: string;
  available: boolean;
  prepTimeMin: number;
  stockQuantity: number;
  lowStockThreshold: number;
}

export interface RestockRequest {
  ID: string;
  item_ID: string;
  item?: MenuItem;
  quantity: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  urgency: 'low' | 'normal' | 'high' | 'critical';
  requestedAt: string;
  fulfilledAt: string | null;
  notes: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  action?: {
    type: 'filter' | 'highlight' | 'restock';
    data?: any;
  };
}
