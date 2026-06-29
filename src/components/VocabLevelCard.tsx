'use client';

import styles from './VocabLevelCard.module.css';

interface VocabLevelCardProps {
  level: number; // 1-10
  status: 'locked' | 'unlocked' | 'completed';
  wordCount: number; // always 50
  answerCount: number;
  correctCount: number;
  onLearn: () => void;
  onPractice: () => void;
}

export default function VocabLevelCard({
  level,
  status,
  wordCount,
  answerCount,
  correctCount,
  onLearn,
  onPractice,
}: VocabLevelCardProps) {
  /* ── Derived values ── */
  const accuracy =
    answerCount > 0 ? Math.round((correctCount / answerCount) * 100) : null;

  const progressPercent = Math.min(Math.round((answerCount / 40) * 100), 100);

  /* ── Card state class (global module-card system) ── */
  const stateClass =
    status === 'locked'
      ? 'module-card module-card-locked'
      : status === 'completed'
      ? 'module-card module-card-completed'
      : 'module-card module-card-unlocked';

  return (
    <article
      id={`vocab-level-card-${level}`}
      className={`${stateClass} ${styles.card}`}
      aria-label={`Level ${level} — ${status}`}
    >
      {/* Status indicator */}
      <div className={styles.statusArea}>
        {status === 'locked' && (
          <span className={styles.statusIcon} aria-label="Locked">
            🔒
          </span>
        )}
        {status === 'completed' && (
          <span
            className={`${styles.statusIcon} ${styles.statusCompleted}`}
            aria-label="Completed"
          >
            ✓
          </span>
        )}
        {status === 'unlocked' && (
          <span
            className={`${styles.statusIcon} ${styles.statusUnlocked}`}
            aria-label="Available"
          >
            📖
          </span>
        )}
      </div>

      {/* Level number badge */}
      <div className={styles.numberBadge}>
        <span className={styles.numberText}>{level}</span>
      </div>

      {/* Level name */}
      <h3 className={styles.levelName}>Level {level}</h3>

      {/* Stats — only when unlocked or completed */}
      {status !== 'locked' && (
        <>
          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span
                id={`vocab-level-${level}-accuracy`}
                className={styles.statValue}
              >
                {accuracy !== null ? `${accuracy}%` : 'N/A'}
              </span>
              <span className={styles.statLabel}>Accuracy</span>
            </div>
            <div className={styles.statItem}>
              <span
                id={`vocab-level-${level}-answers`}
                className={styles.statValue}
              >
                {answerCount}
              </span>
              <span className={styles.statLabel}>Answers</span>
            </div>
          </div>

          {/* Progress toward 40-answer minimum */}
          <div className={styles.progressWrapper}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className={styles.progressLabel}>
              {answerCount >= 40
                ? '40 / 40 answers'
                : `${answerCount} / 40 answers`}
            </span>
          </div>
        </>
      )}

      {/* Action buttons — unlocked */}
      {status === 'unlocked' && (
        <div className={styles.actions}>
          <button
            id={`vocab-level-${level}-learn`}
            type="button"
            className="btn btn-primary"
            onClick={onLearn}
          >
            Learn
          </button>
          <button
            id={`vocab-level-${level}-practice`}
            type="button"
            className="btn btn-secondary"
            onClick={onPractice}
          >
            Practice
          </button>
        </div>
      )}

      {/* Action buttons — completed */}
      {status === 'completed' && (
        <div className={styles.actions}>
          <button
            id={`vocab-level-${level}-review`}
            type="button"
            className="btn btn-outline"
            onClick={onLearn}
          >
            Review
          </button>
          <button
            id={`vocab-level-${level}-practice`}
            type="button"
            className="btn btn-secondary"
            onClick={onPractice}
          >
            Practice Again
          </button>
        </div>
      )}

      {/* Locked message */}
      {status === 'locked' && (
        <p className={styles.lockedText}>
          Complete the previous level to unlock
        </p>
      )}
    </article>
  );
}
