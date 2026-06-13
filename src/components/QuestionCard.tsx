'use client';

import { useState, useCallback } from 'react';
import styles from './QuestionCard.module.css';

interface QuestionCardProps {
  question: string;
  type: 'multiple_choice' | 'free_text';
  options?: string[];
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function QuestionCard({
  question,
  type,
  options = [],
  onAnswer,
  disabled = false,
}: QuestionCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [freeTextValue, setFreeTextValue] = useState('');
  const [answered, setAnswered] = useState(false);

  const handleOptionClick = useCallback(
    (option: string) => {
      if (disabled || answered) return;
      setAnswered(true);
      setSelectedOption(option);
      onAnswer(option);
    },
    [disabled, answered, onAnswer]
  );

  const handleFreeTextSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (disabled || !freeTextValue.trim()) return;
      onAnswer(freeTextValue.trim());
    },
    [disabled, freeTextValue, onAnswer]
  );

  return (
    <div id="question-card" className={`${styles.card} animate-fade-in`}>
      <p className={styles.questionText}>{question}</p>

      {type === 'multiple_choice' && (
        <div className={styles.optionsGrid} role="group" aria-label="Answer options">
          {options.map((option, index) => {
            const label = OPTION_LABELS[index] ?? String(index + 1);
            const isSelected = selectedOption === option;

            return (
              <button
                key={`${label}-${option}`}
                id={`question-option-${label.toLowerCase()}`}
                type="button"
                className={`${styles.optionButton} ${isSelected ? styles.optionSelected : ''}`}
                onClick={() => handleOptionClick(option)}
                disabled={disabled}
                aria-pressed={isSelected}
              >
                <span className={styles.optionLabel}>{label}</span>
                <span className={styles.optionText}>{option}</span>
              </button>
            );
          })}
        </div>
      )}

      {type === 'free_text' && (
        <form className={styles.freeTextForm} onSubmit={handleFreeTextSubmit}>
          <input
            id="question-free-text-input"
            type="text"
            className={`input input-lg ${styles.freeTextInput}`}
            placeholder="Type your answer here…"
            value={freeTextValue}
            onChange={(e) => setFreeTextValue(e.target.value)}
            disabled={disabled}
            autoComplete="off"
          />
          <button
            id="question-free-text-submit"
            type="submit"
            className={`btn btn-primary btn-lg ${styles.submitButton}`}
            disabled={disabled || !freeTextValue.trim()}
          >
            Submit
          </button>
        </form>
      )}
    </div>
  );
}
