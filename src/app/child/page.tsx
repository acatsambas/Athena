'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SubjectProgress } from '@/lib/firestore-schema';
import Header from '@/components/Header';
import PointsDisplay from '@/components/PointsDisplay';
import LoadingSpinner from '@/components/LoadingSpinner';

interface SubjectData extends SubjectProgress {
  id: string;
}

export default function ChildDashboard() {
  const { user, loading, userType, childSession, childLogout, signOut, refreshChildPoints } = useAuth();
  const router = useRouter();
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  useEffect(() => {
    if (!loading && (userType !== 'child' || !childSession)) {
      router.push('/login');
    }
  }, [user, loading, userType, childSession, router]);

  const loadSubjects = useCallback(async () => {
    if (!childSession) return;

    try {
      const subjectsRef = collection(
        db,
        'parents',
        childSession.parentId,
        'children',
        childSession.childId,
        'subjects'
      );
      const snap = await getDocs(subjectsRef);
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as SubjectProgress),
      }));
      setSubjects(data);
    } catch (err) {
      console.error('Failed to load subjects:', err);
    } finally {
      setLoadingSubjects(false);
    }
  }, [childSession]);

  useEffect(() => {
    if (childSession) {
      loadSubjects();
      refreshChildPoints();
    }
  }, [childSession, loadSubjects, refreshChildPoints]);

  const handleLogout = async () => {
    childLogout();
    await signOut();
  };

  if (loading || !childSession) {
    return (
      <div className="page-center">
        <LoadingSpinner message="Loading…" />
      </div>
    );
  }

  const mathSubject = subjects.find((s) => s.id === 'mathematics');
  const hasStartedMath = mathSubject?.assessmentComplete;

  const englishSubject = subjects.find((s) => s.id === 'english');

  return (
    <div className="dashboard-page child-dashboard">
      <Header
        userName={childSession.firstName}
        userType="child"
        points={childSession.totalPoints}
        onLogout={handleLogout}
      />

      <main className="dashboard-content container">
        {/* Welcome Section */}
        <div className="child-welcome fade-in">
          <h1>
            Hello, <span className="highlight">{childSession.firstName}</span>! 👋
          </h1>
          <PointsDisplay points={childSession.totalPoints} />
        </div>

        {/* Subjects */}
        <section className="subjects-section">
          <h2>Your Subjects</h2>

          {loadingSubjects ? (
            <LoadingSpinner message="Loading subjects…" size="sm" />
          ) : (
            <div className="subjects-grid">
              {/* Mathematics Card */}
              <div className="card subject-card" id="subject-mathematics">
                <div className="subject-card-header">
                  <span className="subject-icon">📐</span>
                  <h3>Mathematics</h3>
                </div>

                {!hasStartedMath ? (
                  <div className="subject-card-body">
                    <p className="subject-description">
                      Ready to start your maths journey? We&apos;ll begin with a quick
                      assessment to see what you already know.
                    </p>
                    <button
                      id="btn-get-started"
                      className="btn btn-primary btn-lg btn-full"
                      onClick={() => router.push('/child/mathematics/assessment')}
                    >
                      🚀 Let&apos;s get started!
                    </button>
                  </div>
                ) : (
                  <div className="subject-card-body">
                    <div className="subject-stats">
                      <div className="stat">
                        <span className="stat-value">Level {mathSubject.currentLevel}</span>
                        <span className="stat-label">Current Level</span>
                      </div>
                      <div className="stat">
                        <span className="stat-value">{mathSubject.totalAnswers}</span>
                        <span className="stat-label">Questions Answered</span>
                      </div>
                    </div>
                    <button
                      id="btn-view-modules"
                      className="btn btn-primary btn-full"
                      onClick={() => router.push('/child/mathematics')}
                    >
                      View Modules →
                    </button>
                  </div>
                )}
              </div>

              {/* Placeholder for future subjects */}
              <div className="card subject-card subject-card-locked">
                <div className="subject-card-header">
                  <span className="subject-icon">🔬</span>
                  <h3>Science</h3>
                </div>
                <div className="subject-card-body">
                  <p className="text-muted">Coming soon!</p>
                </div>
              </div>

              <div className="card subject-card" id="subject-english">
                <div className="subject-card-header">
                  <span className="subject-icon">📖</span>
                  <h3>English</h3>
                </div>

                {!englishSubject ? (
                  <div className="subject-card-body">
                    <p className="subject-description">
                      Build your vocabulary! Start learning new words and
                      test yourself with fun quizzes.
                    </p>
                    <button
                      id="btn-start-english"
                      className="btn btn-primary btn-lg btn-full"
                      onClick={() => router.push('/child/english')}
                    >
                      📚 Start Learning!
                    </button>
                  </div>
                ) : (
                  <div className="subject-card-body">
                    <div className="subject-stats">
                      <div className="stat">
                        <span className="stat-value">{englishSubject.totalAnswers}</span>
                        <span className="stat-label">Questions Answered</span>
                      </div>
                    </div>
                    <button
                      id="btn-view-english"
                      className="btn btn-primary btn-full"
                      onClick={() => router.push('/child/english')}
                    >
                      Continue Learning →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
