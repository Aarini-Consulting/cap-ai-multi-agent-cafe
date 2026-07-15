interface OrderBarProps { count: number; total: number; ctaLabel: string; onCta: () => void; disabled?: boolean; }
export default function OrderBar({ count, total, ctaLabel, onCta, disabled }: OrderBarProps) {
  if (count === 0) return null;
  return (
    <div className="order-bar">
      <div className="order-summary">
        <span className="order-count">{count} item{count !== 1 ? 's' : ''}</span>
        <span className="order-total">{'\u20AC'}{total.toFixed(2)}</span>
      </div>
      <button className="order-cta" onClick={onCta} disabled={disabled}>{ctaLabel}</button>
    </div>
  );
}
