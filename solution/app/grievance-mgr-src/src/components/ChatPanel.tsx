import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

/** Simple markdown → HTML: **bold**, *italic*, `code`, lists, line breaks */
function renderMarkdown(text: string): React.ReactNode {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^####\s+(.+)$/gm, '<div class="md-h4">$1</div>')
    .replace(/^###\s+(.+)$/gm, '<div class="md-h3">$1</div>')
    .replace(/^##\s+(.+)$/gm, '<div class="md-h3">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^(\d+)\.\s+/gm, '<span class="md-num">$1.</span> ')
    .replace(/^[-•]\s+/gm, '<span class="md-bullet">•</span> ')
    .replace(/\n\n/g, '<div class="md-gap"></div>')
    .replace(/\n/g, '<br/>');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (input: string) => void;
  onFilter?: (filter: { status?: string; sentiment?: string }) => void;
}

const QUICK_ACTIONS = [
  { label: 'Show critical complaints', message: 'Show me the most critical complaints that need immediate attention' },
  { label: 'Resolve oldest', message: 'Which is the oldest unresolved complaint? Can you help me resolve it?' },
  { label: 'Sentiment breakdown', message: 'Give me a breakdown of customer sentiment across all feedback' },
  { label: "This week's trends", message: "What are this week's complaint trends? Any patterns?" },
];

export default function ChatPanel({ messages, isLoading, onSend, onFilter }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSentInitial = useRef(false);

  // Auto-send initial summary request on mount
  useEffect(() => {
    if (!hasSentInitial.current) {
      hasSentInitial.current = true;
      onSend('Summarize all customer feedback received today. Include counts by sentiment and any patterns you notice.');
    }
  }, [onSend]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // When agent messages arrive with actions, propagate filter
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'agent' && last.action?.type === 'filter' && onFilter) {
      onFilter(last.action.data);
    }
  }, [messages, onFilter]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-header-icon">&#10024;</span>
        <h2>Grievance Assistant</h2>
      </div>

      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble ${msg.role}`}>
            {msg.role === 'agent' && (
              <div className="bubble-avatar">&#10024;</div>
            )}
            <div className="bubble-content">
              <div className="bubble-text">
                {msg.role === 'agent' ? renderMarkdown(msg.content) : msg.content}
              </div>
              <div className="bubble-time">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-bubble agent">
            <div className="bubble-avatar">&#10024;</div>
            <div className="bubble-content">
              <div className="bubble-text typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-quick-actions">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.label}
            className="quick-action-chip"
            onClick={() => onSend(action.message)}
            disabled={isLoading}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="chat-input-bar">
        <input
          type="text"
          className="chat-input"
          placeholder="Ask about complaints, trends, resolutions..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
