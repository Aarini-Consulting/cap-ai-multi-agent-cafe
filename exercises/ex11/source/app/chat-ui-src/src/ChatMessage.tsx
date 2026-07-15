import React from 'react';
import type { Message } from './types';

interface ChatMessageProps {
  message: Message;
}

/**
 * Minimal markdown renderer: handles **bold**, *italic*, `code`,
 * ```code blocks```, unordered lists (- item), and line breaks.
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`list-${nodes.length}`} className="chat-list">
          {listItems.map((item, i) => (
            <li key={i}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const flushCodeBlock = () => {
    if (codeBlockContent.length > 0) {
      nodes.push(
        <pre key={`code-${nodes.length}`} className="chat-code-block">
          <code>{codeBlockContent.join('\n')}</code>
        </pre>
      );
      codeBlockContent = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Toggle code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        flushCodeBlock();
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // List items
    if (/^\s*[-*]\s+/.test(line)) {
      const content = line.replace(/^\s*[-*]\s+/, '');
      listItems.push(content);
      continue;
    }

    // Numbered list items
    if (/^\s*\d+\.\s+/.test(line)) {
      const content = line.replace(/^\s*\d+\.\s+/, '');
      listItems.push(content);
      continue;
    }

    flushList();

    // Headings
    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^(#+)/)?.[1].length || 1;
      const content = line.replace(/^#+\s+/, '');
      const Tag = `h${Math.min(level + 2, 6)}` as keyof JSX.IntrinsicElements;
      nodes.push(<Tag key={`h-${nodes.length}`} className="chat-heading">{formatInline(content)}</Tag>);
      continue;
    }

    // Empty lines
    if (line.trim() === '') {
      nodes.push(<div key={`br-${nodes.length}`} className="chat-line-break" />);
      continue;
    }

    // Regular paragraph
    nodes.push(
      <p key={`p-${nodes.length}`} className="chat-paragraph">
        {formatInline(line)}
      </p>
    );
  }

  flushList();
  if (inCodeBlock) flushCodeBlock();

  return nodes;
}

/** Format inline markdown: **bold**, *italic*, `code` */
function formatInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Regex for **bold**, *italic*, `inline code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(<strong key={`b-${match.index}`}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={`i-${match.index}`}>{match[3]}</em>);
    } else if (match[4]) {
      // `code`
      parts.push(<code key={`c-${match.index}`} className="chat-inline-code">{match[4]}</code>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`chat-message-row ${isUser ? 'chat-message-row--user' : 'chat-message-row--agent'}`}>
      <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--agent'}`}>
        <div className="chat-bubble__label">
          {isUser ? 'You' : 'Agent'}
        </div>
        <div className="chat-bubble__content">
          {isUser
            ? <p className="chat-paragraph">{message.content}</p>
            : renderMarkdown(message.content)
          }
        </div>
        <div className="chat-bubble__time">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
