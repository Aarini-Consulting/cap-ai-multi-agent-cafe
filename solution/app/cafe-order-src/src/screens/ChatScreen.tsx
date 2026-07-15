import { useState, useEffect, useRef } from 'react';
import type { MenuItem, Screen, AgentMessage } from '../types';
import AgentBubble from '../components/AgentBubble';
import UserBubble from '../components/UserBubble';
import DishCard from '../components/DishCard';
import QuickReplyChip from '../components/QuickReplyChip';
import OrderBar from '../components/OrderBar';
import { useAgent } from '../hooks/useAgent';

interface ChatScreenProps {
  menuItems: MenuItem[];
  cartCount: number;
  cartTotal: number;
  cartQty: (id: string) => number;
  onAddItem: (item: MenuItem) => void;
  onRemoveItem: (id: string) => void;
  onNavigate: (screen: Screen) => void;
}

interface ParsedMessage {
  role: 'user' | 'agent';
  intro: string;
  items: Array<{ item: MenuItem; reason: string }>;
}

export default function ChatScreen({ menuItems, cartCount, cartTotal, cartQty, onAddItem, onRemoveItem, onNavigate }: ChatScreenProps) {
  const { messages, isLoading, sendMessage } = useAgent();
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Opening message on mount
  useEffect(() => {
    if (menuItems.length > 0 && messages.length === 0) {
      sendMessage("Hi, I just sat down at table 4. What do you recommend for a quick lunch?");
    }
  }, [menuItems]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function parseAgentMessage(msg: AgentMessage): ParsedMessage {
    if (msg.role === 'user') {
      return { role: 'user', intro: msg.content, items: [] };
    }

    // Find which menu items are mentioned in the response
    const matched = menuItems.filter(item =>
      msg.content.toLowerCase().includes(item.name.toLowerCase())
    );

    if (matched.length === 0) {
      return { role: 'agent', intro: msg.content, items: [] };
    }

    // Extract intro text: everything before the first item mention
    let intro = msg.content;
    let earliestIdx = msg.content.length;

    for (const item of matched) {
      const idx = msg.content.toLowerCase().indexOf(item.name.toLowerCase());
      if (idx >= 0 && idx < earliestIdx) earliestIdx = idx;
    }

    // Get text before first item, clean up markdown artifacts
    intro = msg.content.substring(0, earliestIdx).trim();
    // Remove trailing colons, dashes, or markdown
    intro = intro.replace(/[:\-*#]+\s*$/, '').trim();
    // If intro is too short or empty, use a default
    if (intro.length < 10) {
      intro = "Here are some picks for you. Tap + to add:";
    }

    // Build item list with reasons from nearby text
    const items = matched.map(item => {
      const nameLower = item.name.toLowerCase();
      const idx = msg.content.toLowerCase().indexOf(nameLower);
      // Grab text after the item name (up to 120 chars) for a reason
      const afterName = msg.content.substring(idx + item.name.length, idx + item.name.length + 120);
      // Try to extract a short reason phrase
      const reasonMatch = afterName.match(/[:\-–]\s*(.+?)(?:\n|\.|\*|$)/);
      let reason = reasonMatch?.[1]?.trim() || '';
      // Clean markdown
      reason = reason.replace(/\*\*/g, '').replace(/^\s*[-–]\s*/, '').trim();
      // Fallback to dietary/category
      if (!reason || reason.length > 40) {
        reason = item.dietary?.split(',')[0]?.replace('_', '-') || item.category;
      }
      return { item, reason };
    });

    return { role: 'agent', intro, items };
  }

  async function handleSend(text?: string) {
    const msg = text || inputValue.trim();
    if (!msg) return;
    setInputValue('');
    await sendMessage(msg);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const chips = ['Add a dessert', 'Lighter option', 'Vegan only', 'Under €5'];
  const parsed = messages.map(parseAgentMessage);

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="header-avatar">☕</div>
        <div className="header-info">
          <div className="venue">Level 3 Cafeteria</div>
          <div className="meta">📍 Table 14 · dine-in</div>
        </div>
        <span className="eta-pill">🕐 ~8 min</span>
      </div>

      <div className="screen-body">
        {parsed.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' ? (
              <UserBubble content={msg.intro} />
            ) : (
              <>
                <AgentBubble content={msg.intro} />
                {msg.items.length > 0 && (
                  <div className="reco-list">
                    {msg.items.map(({ item, reason }) => (
                      <DishCard
                        key={item.ID}
                        item={item}
                        reason={reason}
                        qty={cartQty(item.ID)}
                        onAdd={() => onAddItem(item)}
                        onRemove={() => onRemoveItem(item.ID)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {isLoading && <div className="typing">Agent is thinking...</div>}

        {!isLoading && (
          <div className="chips-row">
            {chips.map(c => (
              <QuickReplyChip key={c} label={`${c} \u2197`} onClick={() => handleSend(c)} disabled={isLoading} />
            ))}
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      <div className="input-row">
        <input
          className="chat-input"
          placeholder="Type a message..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button className="send-btn" onClick={() => handleSend()} disabled={!inputValue.trim() || isLoading}>↑</button>
      </div>

      <OrderBar count={cartCount} total={cartTotal} ctaLabel="Review order →" onCta={() => onNavigate('review')} />
    </div>
  );
}
