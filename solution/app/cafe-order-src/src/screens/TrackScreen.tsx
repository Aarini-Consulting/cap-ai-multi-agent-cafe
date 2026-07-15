import { useState, useEffect } from 'react';
import type { Order, Screen } from '../types';
import AgentBubble from '../components/AgentBubble';
import StatusStepper from '../components/StatusStepper';

interface TrackScreenProps {
  order: Order | null;
  onNavigate: (screen: Screen) => void;
}

export default function TrackScreen({ order, onNavigate }: TrackScreenProps) {
  const [step, setStep] = useState(0);
  const [eta, setEta] = useState(8);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => {
        if (prev >= 3) { clearInterval(interval); return 3; }
        return prev + 1;
      });
      setEta(prev => Math.max(0, prev - 2));
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const isReady = step >= 3;

  const agentMessage = isReady
    ? 'All set — your order is at the table. Enjoy your meal!'
    : step >= 2
    ? 'Almost there! Plating your drinks and dessert.'
    : step >= 1
    ? 'Grilling the chicken bowl — smells great!'
    : 'Order sent to the kitchen. Sit tight!';

  return (
    <div className="screen">
      <div className="screen-header center">
        <div className="confirm-icon">✓</div>
        <div className="confirm-title">Order confirmed</div>
        <div className="confirm-sub">#{order?.ID?.substring(0, 8).toUpperCase()} · Table 14 · charged to badge</div>
      </div>

      <div className="screen-body">
        <div className="eta-row">
          <span>Estimated ready</span>
          <span className="eta-time">{eta > 0 ? `${eta} min` : 'Now!'}</span>
        </div>

        <StatusStepper currentStep={step} />

        <AgentBubble content={agentMessage} />

        {isReady ? (
          <div className="post-actions" style={{ border: 'none', padding: '16px 0' }}>
            <button className="ghost-btn" onClick={() => onNavigate('feedback')}>⭐ Leave a review</button>
            <button className="ghost-btn" onClick={() => onNavigate('chat')}>New order</button>
          </div>
        ) : (
          <div className="post-actions" style={{ border: 'none', padding: '16px 0' }}>
            <button className="ghost-btn" onClick={() => onNavigate('chat')}>Add water</button>
            <button className="ghost-btn" onClick={() => onNavigate('chat')}>Modify order</button>
          </div>
        )}
      </div>
    </div>
  );
}
