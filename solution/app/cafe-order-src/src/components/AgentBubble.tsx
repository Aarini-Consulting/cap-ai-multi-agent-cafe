interface AgentBubbleProps { content: string; }
export default function AgentBubble({ content }: AgentBubbleProps) {
  return (
    <div className="agent-bubble">
      <div className="agent-avatar">✦</div>
      <div className="agent-text">{content}</div>
    </div>
  );
}
