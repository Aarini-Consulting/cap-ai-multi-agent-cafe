interface UserBubbleProps { content: string; }
export default function UserBubble({ content }: UserBubbleProps) {
  return (
    <div className="user-bubble">
      <div className="user-text">{content}</div>
    </div>
  );
}
