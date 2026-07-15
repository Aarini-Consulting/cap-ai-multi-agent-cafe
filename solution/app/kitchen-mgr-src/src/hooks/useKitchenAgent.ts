import { useState, useCallback } from 'react';
import { ChatMessage } from '../types';

interface UseKitchenAgentResult {
  messages: ChatMessage[];
  isLoading: boolean;
  sendMessage: (input: string) => Promise<void>;
}

let msgCounter = 0;
function makeId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

export function useKitchenAgent(): UseKitchenAgentResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (input: string) => {
    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/cafe/invokeAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      if (!res.ok) throw new Error(`Agent request failed: ${res.statusText}`);

      const data = await res.json();
      const content = typeof data.value === 'string' ? data.value : JSON.stringify(data.value ?? data);

      let action: ChatMessage['action'] | undefined;
      const lowerContent = content.toLowerCase();
      if (lowerContent.includes('low stock') || lowerContent.includes('running low')) {
        action = { type: 'filter', data: { view: 'stock', stockFilter: 'low' } };
      } else if (lowerContent.includes('restock') || lowerContent.includes('pending')) {
        action = { type: 'filter', data: { view: 'restocks' } };
      }

      const agentMsg: ChatMessage = {
        id: makeId(),
        role: 'agent',
        content,
        timestamp: new Date(),
        action,
      };
      setMessages(prev => [...prev, agentMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: makeId(),
        role: 'agent',
        content: `Sorry, I encountered an error: ${err.message}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, isLoading, sendMessage };
}
