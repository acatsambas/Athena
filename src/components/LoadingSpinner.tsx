'use client';

import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function LoadingSpinner({
  message,
  size = 'md',
}: LoadingSpinnerProps) {
  return (
    <div
      id="loading-spinner"
      className={`${styles.container} ${styles[size]}`}
      role="status"
      aria-label={message || 'Loading'}
    >
      <div className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      {message && <p className={styles.message}>{message}</p>}
    </div>
  );
}
