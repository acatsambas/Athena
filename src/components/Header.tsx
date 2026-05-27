'use client';

import PointsDisplay from './PointsDisplay';
import styles from './Header.module.css';

interface HeaderProps {
  userName?: string;
  userType: 'parent' | 'child';
  points?: number;
  onLogout: () => void;
}

export default function Header({
  userName,
  userType,
  points = 0,
  onLogout,
}: HeaderProps) {
  return (
    <header id="app-header" className={styles.header}>
      <div className={`container ${styles.inner}`}>
        {/* Brand */}
        <div className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true">🦉</span>
          <span className={styles.brandName}>Athena</span>
        </div>

        {/* Right side */}
        <div className={styles.actions}>
          {userType === 'child' && (
            <PointsDisplay points={points} animate />
          )}

          {userName && (
            <span id="header-username" className={styles.userName}>
              {userName}
            </span>
          )}

          <button
            id="header-logout"
            type="button"
            className={`btn btn-ghost btn-sm ${styles.logoutButton}`}
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
