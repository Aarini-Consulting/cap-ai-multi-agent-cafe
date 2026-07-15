import { useState, useCallback, useRef } from 'react';
import type { Message } from './types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function useChat(servicePath: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const agentMessageId = generateId();
    const agentMessage: Message = {
      id: agentMessageId,
      role: 'agent',
      content: '',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, agentMessage]);

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch(`${servicePath}/invokeAgent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // Handle SSE streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error('No response body');

        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const token = parsed.choices?.[0]?.delta?.content
                  || parsed.content
                  || parsed.text
                  || parsed.data
                  || '';
                accumulated += token;
                setMessages(prev =>
                  prev.map(m =>
                    m.id === agentMessageId
                      ? { ...m, content: accumulated, timestamp: new Date() }
                      : m
                  )
                );
              } catch {
                // Non-JSON SSE data -- treat as plain text token
                accumulated += data;
                setMessages(prev =>
                  prev.map(m =>
                    m.id === agentMessageId
                      ? { ...m, content: accumulated, timestamp: new Date() }
                      : m
                  )
                );
              }
            }
          }
        }
      } else {
        // Handle standard JSON response
        const data = await response.json();
        const content = data.value
          || data.result
          || data.response
          || data.message
          || data.content
          || data.text
          || (typeof data === 'string' ? data : JSON.stringify(data, null, 2));

        setMessages(prev =>
          prev.map(m =>
            m.id === agentMessageId
              ? { ...m, content, timestamp: new Date() }
              : m
          )
        );
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === agentMessageId
              ? { ...m, content: '(Request cancelled)' }
              : m
          )
        );
      } else {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setMessages(prev =>
          prev.map(m =>
            m.id === agentMessageId
              ? { ...m, content: `Error: ${errorMsg}` }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [servicePath, isLoading]);

  const clearMessages = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, sendMessage, clearMessages };
}
