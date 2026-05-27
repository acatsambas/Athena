'use client';

import { useState } from 'react';
import ProgressBar from './ProgressBar';
import styles from './LessonViewer.module.css';

export interface LessonSection {
  type: 'text' | 'diagram' | 'knowledge_check';
  title?: string;
  content: string; // text or SVG markup or question text
  options?: string[]; // for knowledge_check type
}

interface LessonViewerProps {
  sections: LessonSection[];
  currentSection: number;
  onKnowledgeCheck: (answer: string) => void;
  onNextSection: () => void;
  onAskQuestion: () => void;
}

export default function LessonViewer({
  sections,
  currentSection,
  onKnowledgeCheck,
  onNextSection,
  onAskQuestion,
}: LessonViewerProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const section = sections[currentSection];
  if (!section) return null;

  const isLast = currentSection >= sections.length - 1;

  const handleCheckAnswer = (answer: string) => {
    setSelectedAnswer(answer);
    onKnowledgeCheck(answer);
  };

  const handleNext = () => {
    setSelectedAnswer(null);
    onNextSection();
  };

  return (
    <div id="lesson-viewer" className={styles.container}>
      {/* Progress */}
      <div className={styles.progressArea}>
        <ProgressBar
          current={currentSection + 1}
          total={sections.length}
          label="Lesson Progress"
          variant="default"
        />
      </div>

      {/* Section content */}
      <div className={`${styles.sectionCard} animate-fade-in`} key={currentSection}>
        {section.title && (
          <h2 className={styles.sectionTitle}>{section.title}</h2>
        )}

        {section.type === 'text' && (
          <div className={styles.textContent}>
            <p>{section.content}</p>
          </div>
        )}

        {section.type === 'diagram' && (
          <div
            className={styles.diagramContent}
            dangerouslySetInnerHTML={{ __html: section.content }}
            aria-label="Lesson diagram"
          />
        )}

        {section.type === 'knowledge_check' && (
          <div className={styles.checkContent}>
            <p className={styles.checkQuestion}>{section.content}</p>
            {section.options && (
              <div className={styles.checkOptions}>
                {section.options.map((option, idx) => (
                  <button
                    key={idx}
                    id={`lesson-check-option-${idx}`}
                    type="button"
                    className={`${styles.checkOption} ${
                      selectedAnswer === option ? styles.checkOptionSelected : ''
                    }`}
                    onClick={() => handleCheckAnswer(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className={styles.navArea}>
        {!isLast ? (
          <button
            id="lesson-next-section"
            type="button"
            className="btn btn-primary btn-lg"
            onClick={handleNext}
          >
            Next →
          </button>
        ) : (
          <button
            id="lesson-complete"
            type="button"
            className="btn btn-primary btn-lg"
            onClick={handleNext}
          >
            Complete Lesson ✓
          </button>
        )}
      </div>

      {/* Floating Ask a Question button */}
      <button
        id="lesson-ask-question"
        type="button"
        className={styles.askButton}
        onClick={onAskQuestion}
        aria-label="Ask a question"
      >
        <span className={styles.askIcon}>❓</span>
        <span className={styles.askLabel}>Ask a Question</span>
      </button>
    </div>
  );
}
