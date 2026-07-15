import { useState, useEffect } from 'react';
import type { CartItem, Screen, Order } from '../types';
import AgentBubble from '../components/AgentBubble';
import DishCard from '../components/DishCard';

interface ReviewScreenProps {
  cartItems: CartItem[];
  total: number;
  onUpdateQty: (id: string, qty: number) => void;
  onNavigate: (screen: Screen) => void;
  onPlaceOrder: () => Promise<Order | null>;
}

export default function ReviewScreen({ cartItems, total, onUpdateQty, onNavigate, onPlaceOrder }: ReviewScreenProps) {
  const [placing, setPlacing] = useState(false);
  const [sanityCheck, setSanityCheck] = useState('');

  useEffect(() => {
    // Generate a sanity check based on cart contents
    const categories = new Set(cartItems.map(ci => ci.item.category));
    const parts: string[] = [];
    if (categories.has('main')) parts.push('a main');
    if (categories.has('drink')) parts.push('a drink');
    if (categories.has('dessert')) parts.push('a dessert');
    if (categories.has('snack')) parts.push('a snack');

    if (parts.length >= 2) {
      setSanityCheck(`Nice combo! You've got ${parts.join(', ')}. Looks like a well-rounded meal.`);
    } else if (cartItems.length === 1) {
      setSanityCheck(`Just the ${cartItems[0].item.name}? Want to add a drink or dessert?`);
    } else {
      setSanityCheck(`You have ${cartItems.length} items. Ready to order?`);
    }
  }, [cartItems]);

  const vat = total * 0.19; // 19% VAT included in price
  const netTotal = total - vat;

  async function handlePlace() {
    setPlacing(true);
    const order = await onPlaceOrder();
    if (order) onNavigate('track');
    setPlacing(false);
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={() => onNavigate('chat')}>{'\u2190'} Back</button>
        <div className="venue">Your order</div>
        <div className="meta">Table 4 {'\u00B7'} ~15 min</div>
      </div>

      <div className="screen-body">
        {cartItems.length === 0 ? (
          <div className="empty-cart">Your cart is empty</div>
        ) : (
          <>
            <div className="reco-list">
              {cartItems.map(ci => (
                <DishCard
                  key={ci.item.ID}
                  item={ci.item}
                  qty={ci.qty}
                  showStepper
                  onUpdateQty={(qty) => onUpdateQty(ci.item.ID, qty)}
                />
              ))}
            </div>

            <AgentBubble content={sanityCheck} />

            <div className="totals">
              <div className="total-row"><span>Subtotal</span><span>{'\u20AC'}{netTotal.toFixed(2)}</span></div>
              <div className="total-row muted"><span>VAT (19%)</span><span>{'\u20AC'}{vat.toFixed(2)}</span></div>
              <div className="total-row bold"><span>Total</span><span>{'\u20AC'}{total.toFixed(2)}</span></div>
            </div>

            <div className="place-footer">
              <div className="pay-info">{'\u{1F4B3}'} Company card {'\u00B7'} Employee</div>
              <button className="place-btn" onClick={handlePlace} disabled={placing || cartItems.length === 0}>
                {placing ? 'Placing...' : 'Place order'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
