'use client';

import { useState } from 'react';
import styles from './VocabFlashcard.module.css';

interface VocabFlashcardProps {
  word: string;
  definition: string;
  onNext: () => void;
  cardNumber: number; // current card (1-based)
  totalCards: number; // total cards
}

export default function VocabFlashcard({
  word,
  definition,
  onNext,
  cardNumber,
  totalCards,
}: VocabFlashcardProps) {
  const [flipped, setFlipped] = useState(false);

  const handleShowDefinition = () => {
    setFlipped(true);
  };

  const handleNext = () => {
    setFlipped(false);
    onNext();
  };

  return (
    <div className={styles.flashcardContainer} id="vocab-flashcard">
      {/* Card counter */}
      <span className={styles.counter} id="vocab-flashcard-counter">
        {cardNumber} / {totalCards}
      </span>

      {/* Flip card */}
      <div
        className={`${styles.flashcard} ${flipped ? styles.flashcardFlipped : ''}`}
        id="vocab-flashcard-card"
      >
        {/* Front — word */}
        <div className={styles.cardFront}>
          <span className={styles.word}>{word}</span>
          <button
            id="vocab-flashcard-show"
            type="button"
            className={styles.showBtn}
            onClick={handleShowDefinition}
          >
            Show Definition
          </button>
        </div>

        {/* Back — definition */}
        <div className={styles.cardBack}>
          <span className={styles.definitionLabel}>Definition</span>
          <span className={styles.word}>{word}</span>
          <span className={styles.definition}>{definition}</span>
          <button
            id="vocab-flashcard-next"
            type="button"
            className={styles.nextBtn}
            onClick={handleNext}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
