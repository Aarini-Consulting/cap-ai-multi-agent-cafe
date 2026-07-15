import { useState, useCallback } from 'react';
import type { AgentMessage } from '../types';

export function useAgent() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (input: string): Promise<string> => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return '';

    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/cafe/invokeAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = await response.json();
      const content = data.value || data.result || data.response || data.message || data.content || '';

      setMessages(prev => [...prev, { role: 'agent', content }]);
      return content;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev => [...prev, { role: 'agent', content: `Error: ${errMsg}` }]);
      return '';
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  return { messages, isLoading, sendMessage };
}
