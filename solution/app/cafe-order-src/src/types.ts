export interface MenuItem {
  ID: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  dietary: string | null;
  available: boolean;
  prepTimeMin: number;
  stockQuantity: number;
}

export interface CartItem {
  item: MenuItem;
  qty: number;
}

export interface Order {
  ID: string;
  status: string;
  total: number;
  items: Array<{ ID: string; item: MenuItem; quantity: number; subtotal: number }>;
}

export interface AgentMessage {
  role: 'user' | 'agent';
  content: string;
}

export type Screen = 'chat' | 'filter' | 'review' | 'track' | 'feedback';
