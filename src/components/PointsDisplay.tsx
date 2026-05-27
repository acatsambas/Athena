'use client';

import { useEffect, useState, useRef } from 'react';
import styles from './PointsDisplay.module.css';

interface PointsDisplayProps {
  points: number;
  animate?: boolean;
}

export default function PointsDisplay({
  points,
  animate = false,
}: PointsDisplayProps) {
  const [displayPoints, setDisplayPoints] = useState(points);
  const [isBouncing, setIsBouncing] = useState(false);
  const prevPointsRef = useRef(points);

  useEffect(() => {
    if (!animate || points === prevPointsRef.current) {
      setDisplayPoints(points);
      prevPointsRef.current = points;
      return;
    }

    const start = prevPointsRef.current;
    const end = points;
    const diff = end - start;
    const duration = Math.min(Math.abs(diff) * 30, 800);
    const startTime = performance.now();

    setIsBouncing(true);

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayPoints(Math.round(start + diff * eased));

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        prevPointsRef.current = end;
        setTimeout(() => setIsBouncing(false), 600);
      }
    };

    requestAnimationFrame(step);
  }, [points, animate]);

  return (
    <div
      id="points-display"
      className={`${styles.container} ${isBouncing ? styles.bouncing : ''}`}
      aria-label={`${displayPoints} points`}
    >
      <span className={styles.icon} aria-hidden="true">⭐</span>
      <span className={styles.value}>{displayPoints.toLocaleString()}</span>
    </div>
  );
}
