'use client';

import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  variant?: 'default' | 'success' | 'warning';
}

export default function ProgressBar({
  current,
  total,
  label,
  variant = 'default',
}: ProgressBarProps) {
  const percentage = total > 0 ? Math.min((current / total) * 100, 100) : 0;

  const fillClass = variant === 'success'
    ? 'progress-fill progress-fill-success'
    : variant === 'warning'
    ? 'progress-fill progress-fill-warning'
    : 'progress-fill';

  return (
    <div id="progress-bar" className={styles.container}>
      {(label || total > 0) && (
        <div className={styles.labelRow}>
          {label && <span className={styles.label}>{label}</span>}
          <span className={styles.fraction}>
            {current} of {total}
          </span>
        </div>
      )}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label || 'Progress'}
      >
        <div
          className={fillClass}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
