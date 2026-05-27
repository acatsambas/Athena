'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function HomePage() {
  const { user, loading, userType } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (userType === 'child') {
        router.push('/child');
      } else if (userType === 'parent') {
        router.push('/parent');
      }
    }
  }, [user, loading, userType, router]);

  if (loading) {
    return (
      <div className="page-center">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <main className="landing-page">
      <div className="landing-container">
        {/* Hero Section */}
        <div className="landing-hero">
          <div className="landing-logo">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="32" cy="32" r="30" fill="var(--color-primary)" opacity="0.1" />
              <path
                d="M32 8C22 8 16 16 16 24C16 28 18 31 20 33L20 44C20 46.2 21.8 48 24 48L40 48C42.2 48 44 46.2 44 44L44 33C46 31 48 28 48 24C48 16 42 8 32 8Z"
                fill="var(--color-primary)"
              />
              <circle cx="26" cy="24" r="3" fill="white" />
              <circle cx="38" cy="24" r="3" fill="white" />
              <path
                d="M26 34C26 34 29 38 32 38C35 38 38 34 38 34"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <rect x="22" y="48" width="20" height="3" rx="1.5" fill="var(--color-primary-dark)" />
              <rect x="24" y="52" width="16" height="3" rx="1.5" fill="var(--color-primary-dark)" />
              <rect x="26" y="56" width="12" height="3" rx="1.5" fill="var(--color-primary-dark)" />
            </svg>
          </div>
          <h1 className="landing-title">Athena</h1>
          <p className="landing-subtitle">Your personal AI mathematics tutor</p>
          <p className="landing-description">
            Adaptive, personalised learning that meets your child where they are —
            and helps them reach where they want to be.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="landing-actions">
          <button
            id="btn-login"
            className="btn btn-primary btn-lg"
            onClick={() => router.push('/login')}
          >
            Log In
          </button>
          <button
            id="btn-signup"
            className="btn btn-outline btn-lg"
            onClick={() => router.push('/signup')}
          >
            Create Account
          </button>
        </div>

        {/* Features */}
        <div className="landing-features">
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3>Adaptive Learning</h3>
            <p>Content calibrated to your child&apos;s exact ability level</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🧠</div>
            <h3>Socratic Method</h3>
            <p>Guides children to work things out themselves</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Parent Insights</h3>
            <p>AI-generated performance summaries and progress tracking</p>
          </div>
        </div>

        {/* Footer */}
        <footer className="landing-footer">
          <p>Powered by your own AI provider — your API key never leaves your device.</p>
        </footer>
      </div>
    </main>
  );
}
