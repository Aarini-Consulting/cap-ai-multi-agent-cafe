import type { MenuItem, Screen } from '../types';
import AgentBubble from '../components/AgentBubble';
import DishCard from '../components/DishCard';
import QuickReplyChip from '../components/QuickReplyChip';
import OrderBar from '../components/OrderBar';

interface FilterScreenProps {
  constraint: string;
  results: Array<{item: MenuItem; reason: string}>;
  cartCount: number;
  cartTotal: number;
  cartQty: (id: string) => number;
  onAddItem: (item: MenuItem) => void;
  onRemoveItem: (id: string) => void;
  onNavigate: (screen: Screen) => void;
}

export default function FilterScreen({ constraint, results, cartCount, cartTotal, cartQty, onAddItem, onRemoveItem, onNavigate }: FilterScreenProps) {
  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={() => onNavigate('chat')}>{'\u2190'} Back</button>
        <div className="venue">Filtered results</div>
      </div>

      <div className="screen-body">
        <AgentBubble content={constraint} />

        <div className="reco-list">
          {results.map(({ item, reason }) => (
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

        <div className="chips-row">
          <QuickReplyChip label="Back to order" onClick={() => onNavigate('chat')} />
        </div>
      </div>

      <OrderBar count={cartCount} total={cartTotal} ctaLabel="Review order" onCta={() => onNavigate('review')} />
    </div>
  );
}
