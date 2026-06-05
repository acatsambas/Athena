'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { marked } from 'marked';
import styles from './DiagnosticChat.module.css';

interface ChatMessage {
  role: 'system' | 'student' | 'ai';
  text: string;
}

interface DiagnosticChatProps {
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  onComplete: () => void;
  generateResponse: (message: string) => Promise<string>;
}

export default function DiagnosticChat({
  question,
  studentAnswer,
  correctAnswer,
  onComplete,
  generateResponse,
}: DiagnosticChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: "Can you explain why you chose that answer? I'd love to understand your thinking!",
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = inputValue.trim();
      if (!text || isTyping) return;

      const studentMessage: ChatMessage = { role: 'student', text };
      setMessages((prev) => [...prev, studentMessage]);
      setInputValue('');
      setIsTyping(true);

      try {
        const context = `Question: "${question}" | Student answered: "${studentAnswer}" | Correct answer: "${correctAnswer}" | Student explanation: "${text}"`;
        const aiResponse = await generateResponse(context);
        const aiMessage: ChatMessage = { role: 'ai', text: aiResponse };
        setMessages((prev) => [...prev, aiMessage]);
        setHasResponded(true);
      } catch {
        const errorMessage: ChatMessage = {
          role: 'ai',
          text: "I'm sorry, I had trouble processing that. Let's move on!",
        };
        setMessages((prev) => [...prev, errorMessage]);
        setHasResponded(true);
      } finally {
        setIsTyping(false);
      }
    },
    [inputValue, isTyping, question, studentAnswer, correctAnswer, generateResponse]
  );

  return (
    <div id="diagnostic-chat" className={`${styles.container} animate-slide-up`}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>💬</div>
        <div>
          <h3 className={styles.headerTitle}>Let&apos;s Talk About It</h3>
          <p className={styles.headerSubtitle}>Help me understand your thinking</p>
        </div>
      </div>

      <div className={styles.contextBar}>
        <span className={styles.contextLabel}>Question:</span>
        <span className={styles.contextText}>{question}</span>
      </div>

      <div className={styles.chatArea} role="log" aria-label="Diagnostic conversation">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`${styles.bubble} ${
              msg.role === 'student' ? styles.bubbleStudent : styles.bubbleAi
            }`}
          >
            {msg.role === 'ai' && <span className={styles.avatarAi}>🦉</span>}
            {msg.role === 'ai' ? (
              <div
                className={`${styles.bubbleText} lesson-content`}
                dangerouslySetInnerHTML={{ __html: marked.parse(msg.text, { async: false, breaks: true }) as string }}
              />
            ) : (
              <p className={styles.bubbleText}>{msg.text}</p>
            )}
          </div>
        ))}

        {isTyping && (
          <div className={`${styles.bubble} ${styles.bubbleAi}`}>
            <span className={styles.avatarAi}>🦉</span>
            <div className={styles.typingIndicator}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {!hasResponded ? (
        <form className={styles.inputArea} onSubmit={handleSend}>
          <input
            id="diagnostic-chat-input"
            type="text"
            className={`input ${styles.chatInput}`}
            placeholder="Type your explanation…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isTyping}
            autoComplete="off"
          />
          <button
            id="diagnostic-chat-send"
            type="submit"
            className={`btn btn-primary ${styles.sendButton}`}
            disabled={isTyping || !inputValue.trim()}
          >
            Send
          </button>
        </form>
      ) : (
        <div className={styles.completeArea}>
          <button
            id="diagnostic-chat-continue"
            type="button"
            className="btn btn-primary btn-lg"
            onClick={onComplete}
          >
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}
