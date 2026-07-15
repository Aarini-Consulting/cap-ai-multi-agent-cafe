import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '../types';

interface UseGrievanceAgentResult {
  messages: ChatMessage[];
  isLoading: boolean;
  sendMessage: (input: string) => Promise<void>;
}

let msgCounter = 0;
function makeId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

export function useGrievanceAgent(): UseGrievanceAgentResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isFirstMessage = useRef(true);

  const sendMessage = useCallback(async (input: string) => {
    const skipFilter = isFirstMessage.current;
    isFirstMessage.current = false;
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
      // OData action response: { value: "..." }
      const content = typeof data.value === 'string' ? data.value : JSON.stringify(data.value ?? data);

      // Detect filter actions — skip for the initial summary message
      let action: ChatMessage['action'] | undefined;
      if (!skipFilter) {
      const lowerContent = content.toLowerCase();
      const lowerInput = input.toLowerCase();

      // Match on user's query (more reliable than agent response text)
      if (lowerInput.includes('critical') || lowerInput.includes('urgent') || lowerInput.includes('severe')) {
        action = { type: 'filter', data: { sentiment: 'negative', status: 'open' } };
      } else if (lowerInput.includes('negative') || lowerInput.includes('bad')) {
        action = { type: 'filter', data: { sentiment: 'negative' } };
      } else if (lowerInput.includes('open') || lowerInput.includes('unresolved') || lowerInput.includes('pending')) {
        action = { type: 'filter', data: { status: 'open' } };
      } else if (lowerInput.includes('resolved') || lowerInput.includes('closed')) {
        action = { type: 'filter', data: { status: 'resolved' } };
      } else if (lowerInput.includes('positive') || lowerInput.includes('good')) {
        action = { type: 'filter', data: { sentiment: 'positive' } };
      }
      // Also detect from agent response as fallback
      else if (lowerContent.includes('negative') || lowerContent.includes('complaint')) {
        action = { type: 'filter', data: { sentiment: 'negative' } };
      } else if (lowerContent.includes('open')) {
        action = { type: 'filter', data: { status: 'open' } };
      }
      } // end skipFilter check

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
