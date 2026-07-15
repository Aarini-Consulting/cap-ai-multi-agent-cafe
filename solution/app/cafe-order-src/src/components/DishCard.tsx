import type { MenuItem } from '../types';

const categoryStyle: Record<string, { emoji: string; bg: string; color: string }> = {
  main:    { emoji: '🍲', bg: 'var(--tomato-bg)', color: 'var(--tomato)' },
  drink:   { emoji: '☕', bg: 'var(--coffee-bg)', color: 'var(--coffee)' },
  dessert: { emoji: '🍰', bg: 'var(--cream-bg)',  color: 'var(--cream)' },
  snack:   { emoji: '🥗', bg: 'var(--herb-bg)',   color: 'var(--herb)' },
};

interface DishCardProps {
  item: MenuItem;
  reason?: string;
  qty?: number;
  onAdd?: () => void;
  onRemove?: () => void;
  onUpdateQty?: (qty: number) => void;
  showStepper?: boolean;
}

export default function DishCard({ item, reason, qty = 0, onAdd, onRemove, onUpdateQty, showStepper }: DishCardProps) {
  const style = categoryStyle[item.category] || { emoji: '🍴', bg: 'var(--surface)', color: 'var(--muted)' };

  const details: string[] = [];
  if (item.description) details.push(item.description.split(',')[0]);
  if (item.dietary) details.push(item.dietary.replace(/,/g, ' · ').replace(/_/g, '-'));
  if (item.prepTimeMin) details.push(`${item.prepTimeMin} min`);
  details.push(`€${item.price.toFixed(2)}`);

  return (
    <div className="dish-card">
      <div className="dish-icon" style={{ background: style.bg, color: style.color }}>{style.emoji}</div>
      <div className="dish-info">
        <div className="dish-name">
          {item.name}
          {reason && <span className="dish-tag">{reason}</span>}
        </div>
        <div className="dish-detail">{details.join(' · ')}</div>
      </div>
      <div className="dish-action">
        {showStepper ? (
          <div className="qty-stepper">
            <button className="qty-btn" onClick={() => onUpdateQty?.(qty - 1)}>−</button>
            <span className="qty-val">{qty}</span>
            <button className="qty-btn" onClick={() => onUpdateQty?.(qty + 1)}>+</button>
          </div>
        ) : qty > 0 ? (
          <button className="dish-added" onClick={onRemove}>✓</button>
        ) : (
          <button className="dish-add" onClick={onAdd}>+</button>
        )}
      </div>
    </div>
  );
}
