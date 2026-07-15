import { useState } from 'react';
import type { Order, Screen } from '../types';
import AgentBubble from '../components/AgentBubble';

interface FeedbackScreenProps {
  order: Order | null;
  onNavigate: (screen: Screen) => void;
}

export default function FeedbackScreen({ order, onNavigate }: FeedbackScreenProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resolution, setResolution] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isNegative = rating > 0 && rating <= 3;
  const canSubmit = rating > 0 && (rating >= 4 || comment.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit || !order) return;
    setSubmitting(true);

    try {
      if (isNegative) {
        // Bad review → send to grievance agent via orchestrator
        const message = `I want to submit a complaint about my order #${order.ID.substring(0, 8)}. Rating: ${rating}/5. Issue: ${comment}`;

        const res = await fetch('/api/cafe/invokeAgent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });

        if (res.ok) {
          const data = await res.json();
          const agentResponse = data.value || data.result || data.response || '';
          setResolution(agentResponse);
        } else {
          setResolution('We have logged your complaint and our team will follow up shortly. We sincerely apologize for the inconvenience.');
        }
      } else {
        // Good review → just thank them
        setResolution('Thank you for your kind words! We\'re glad you enjoyed your meal. See you next time! 🎉');
      }

      setSubmitted(true);
    } catch (e) {
      setResolution('Your feedback has been recorded. We\'ll get back to you soon.');
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={() => onNavigate('track')}>←</button>
        <div className="header-info">
          <div className="venue">Leave a review</div>
          <div className="meta">Order #{order?.ID?.substring(0, 8).toUpperCase()}</div>
        </div>
      </div>

      <div className="screen-body">
        {!submitted ? (
          <>
            <AgentBubble content="How was your meal? Tap a star to rate your experience." />

            {/* Star rating */}
            <div className="rating-row">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  className={`star-btn ${star <= rating ? 'active' : ''}`}
                  onClick={() => setRating(star)}
                >
                  {star <= rating ? '★' : '☆'}
                </button>
              ))}
            </div>

            {rating > 0 && rating >= 4 && (
              <div className="rating-label good">
                {rating === 5 ? '🎉 Excellent!' : '😊 Good to hear!'}
              </div>
            )}

            {isNegative && (
              <>
                <div className="rating-label bad">
                  {rating === 1 ? '😔 We\'re sorry to hear that.' : rating === 2 ? '😕 That\'s not great.' : '🤔 Could be better.'}
                </div>

                <AgentBubble content="Please tell us what went wrong so we can make it right." />

                <textarea
                  className="feedback-input"
                  placeholder="What happened? (required)"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                />
              </>
            )}

            {rating > 0 && (
              <button
                className="submit-feedback-btn"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
              >
                {submitting ? 'Sending to our team...' : isNegative ? 'Submit complaint' : 'Submit review'}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="feedback-done-icon">
              {isNegative ? '🤝' : '🎉'}
            </div>

            <div className="feedback-done-title">
              {isNegative ? 'Complaint received' : 'Thanks for your review!'}
            </div>

            {resolution && (
              <AgentBubble content={resolution} />
            )}

            <div className="post-actions" style={{ border: 'none', padding: '20px 0' }}>
              <button className="ghost-btn" onClick={() => onNavigate('chat')}>Order again</button>
              <button className="ghost-btn" onClick={() => onNavigate('track')}>Back to order</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
