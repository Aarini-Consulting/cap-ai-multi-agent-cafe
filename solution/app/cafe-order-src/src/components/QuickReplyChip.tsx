interface QuickReplyChipProps { label: string; onClick: () => void; disabled?: boolean; }
export default function QuickReplyChip({ label, onClick, disabled }: QuickReplyChipProps) {
  return <button className="quick-chip" onClick={onClick} disabled={disabled}>{label}</button>;
}
