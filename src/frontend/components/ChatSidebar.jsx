import React, { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

function MarkdownContent({ text }) {
  const html = marked.parse(text || '');
  return <div className="message-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ChatSidebar({ messages, streamingMessage, onSend, isThinking, agentStatus }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, isThinking]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-messages">
        {messages.length === 0 && !streamingMessage && !isThinking && (
          <div className="sidebar-empty">
            <strong>What should we research today?</strong>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}${msg.error ? ' message-error' : ''}`}>
            <div className="message-label">{msg.role === 'user' ? 'You' : 'CoLM'}</div>
            <MarkdownContent text={msg.content} />
          </div>
        ))}
        {isThinking && !streamingMessage && (
          <div className="message message-assistant">
            <div className="message-label">CoLM</div>
            <div className="thinking-row">
              <div className="thinking-loader" />
              {agentStatus && <span className="agent-status">{agentStatus}</span>}
            </div>
          </div>
        )}
        {streamingMessage && (
          <div className="message message-assistant">
            <div className="message-label">CoLM</div>
            <div className="message-content">{streamingMessage}<span className="cursor-blink">▊</span></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="sidebar-input" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI..."
        />
        <button type="submit" disabled={!input.trim()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
