'use client';

import styles from './ModuleCard.module.css';

interface ModuleData {
  number: number;
  name: string;
  status: 'locked' | 'unlocked' | 'completed';
}

interface ModuleCardProps {
  module: ModuleData;
  onLearn: () => void;
  onPractice: () => void;
}

export default function ModuleCard({ module: mod, onLearn, onPractice }: ModuleCardProps) {
  const stateClass =
    mod.status === 'locked'
      ? 'module-card module-card-locked'
      : mod.status === 'completed'
      ? 'module-card module-card-completed'
      : 'module-card module-card-unlocked';

  return (
    <article
      id={`module-card-${mod.number}`}
      className={`${stateClass} ${styles.card}`}
      aria-label={`Module ${mod.number}: ${mod.name} — ${mod.status}`}
    >
      {/* Status indicator */}
      <div className={styles.statusArea}>
        {mod.status === 'locked' && (
          <span className={styles.statusIcon} aria-label="Locked">
            🔒
          </span>
        )}
        {mod.status === 'completed' && (
          <span className={`${styles.statusIcon} ${styles.statusCompleted}`} aria-label="Completed">
            ✓
          </span>
        )}
        {mod.status === 'unlocked' && (
          <span className={`${styles.statusIcon} ${styles.statusUnlocked}`} aria-label="Available">
            📖
          </span>
        )}
      </div>

      {/* Module number badge */}
      <div className={styles.numberBadge}>
        <span className={styles.numberText}>{mod.number}</span>
      </div>

      {/* Module name */}
      <h3 className={styles.moduleName}>{mod.name}</h3>

      {/* Action buttons */}
      {mod.status === 'unlocked' && (
        <div className={styles.actions}>
          <button
            id={`module-${mod.number}-learn`}
            type="button"
            className="btn btn-primary"
            onClick={onLearn}
          >
            Learn
          </button>
          <button
            id={`module-${mod.number}-practice`}
            type="button"
            className="btn btn-secondary"
            onClick={onPractice}
          >
            Practice
          </button>
        </div>
      )}

      {mod.status === 'completed' && (
        <div className={styles.actions}>
          <button
            id={`module-${mod.number}-practice`}
            type="button"
            className="btn btn-secondary"
            onClick={onPractice}
          >
            Practice Again
          </button>
        </div>
      )}

      {mod.status === 'locked' && (
        <p className={styles.lockedText}>Complete previous modules to unlock</p>
      )}
    </article>
  );
}
