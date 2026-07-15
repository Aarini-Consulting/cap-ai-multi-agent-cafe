export interface Feedback {
  ID: string;
  order_ID: string;
  rating: number;
  comment: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  status: 'open' | 'resolved';
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  // Optional: agent can suggest actions that affect the right panel
  action?: {
    type: 'filter' | 'highlight' | 'resolve';
    data?: any;
  };
}
