import { useState, useRef, useEffect } from 'react';
import {
  ShellBar,
  FlexBox,
  Input,
  Button,
  BusyIndicator,
  FlexBoxDirection,
  FlexBoxJustifyContent,
  FlexBoxAlignItems,
} from '@ui5/webcomponents-react';
import '@ui5/webcomponents-icons/dist/paper-plane.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/ai.js';
import ChatMessage from './ChatMessage';
import { useChat } from './useChat';
import { SERVICES } from './types';

export default function App() {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentService = SERVICES[0];
  const { messages, isLoading, sendMessage, clearMessages } = useChat(currentService.path);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <FlexBox
      direction={FlexBoxDirection.Column}
      className="app-container"
    >
      {/* Shell Bar */}
      <ShellBar
        primaryTitle="AI Workshop Chat"
        secondaryTitle={currentService.description}
        logo={
          <img
            src="https://www.sap.com/dam/application/shared/logos/sap-logo-svg.svg/sap-logo-svg.svg"
            alt="SAP"
            style={{ height: '1.5rem' }}
          />
        }
      />

      {/* Main Content */}
      <FlexBox
        direction={FlexBoxDirection.Column}
        className="main-content"
      >
        {/* Chat Area */}
        <div className="chat-area">
          {messages.length === 0 && (
            <FlexBox
              direction={FlexBoxDirection.Column}
              justifyContent={FlexBoxJustifyContent.Center}
              alignItems={FlexBoxAlignItems.Center}
              className="chat-empty-state"
            >
              <div className="chat-empty-icon">
                <ui5-icon name="ai" style={{ fontSize: '3rem', color: 'var(--sapContent_IllustratedMessage_ObjectColor1)' }}></ui5-icon>
              </div>
              <h3 className="chat-empty-title">Start a conversation</h3>
              <p className="chat-empty-subtitle">
                Send a message to the <strong>{currentService.name}</strong> agent
              </p>
            </FlexBox>
          )}

          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {isLoading && messages[messages.length - 1]?.content === '' && (
            <FlexBox
              justifyContent={FlexBoxJustifyContent.Start}
              className="chat-loading"
            >
              <BusyIndicator active size="S" />
            </FlexBox>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="input-area">
          <FlexBox
            direction={FlexBoxDirection.Row}
            alignItems={FlexBoxAlignItems.End}
            className="input-container"
          >
            <Input
              type="Text"
              placeholder={`Message ${currentService.name}...`}
              value={inputValue}
              onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              className="chat-input"
              disabled={isLoading}
            />
            <Button
              design="Emphasized"
              icon="paper-plane"
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="send-button"
            >
              Send
            </Button>
          </FlexBox>
        </div>
      </FlexBox>
    </FlexBox>
  );
}

// Extend JSX for ui5-icon usage
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'ui5-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { name?: string }, HTMLElement>;
    }
  }
}
