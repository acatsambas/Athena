'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ModuleProgress } from '@/lib/firestore-schema';
import Header from '@/components/Header';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function EnglishPage() {
  const { user, loading, userType, childSession, childLogout, signOut } = useAuth();
  const router = useRouter();
  const [moduleData, setModuleData] = useState<ModuleProgress | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && (userType !== 'child' || !childSession)) {
      router.push('/login');
    }
  }, [user, loading, userType, childSession, router]);

  const loadOrCreateModule = useCallback(async () => {
    if (!childSession) return;

    const { parentId, childId } = childSession;

    try {
      // Ensure subject doc exists
      const subjectRef = doc(db, 'parents', parentId, 'children', childId, 'subjects', 'english');
      const subjectSnap = await getDoc(subjectRef);

      if (!subjectSnap.exists()) {
        await setDoc(subjectRef, {
          assessmentComplete: true,
          currentLevel: 1,
          emaScore: 0,
          totalAnswers: 0,
          strengths: [],
          weaknesses: [],
        });
      }

      // Load or create vocabulary module
      const moduleRef = doc(
        db, 'parents', parentId, 'children', childId,
        'subjects', 'english', 'modules', 'vocabulary'
      );
      const moduleSnap = await getDoc(moduleRef);

      if (moduleSnap.exists()) {
        setModuleData(moduleSnap.data() as ModuleProgress);
      } else {
        const initialModule: ModuleProgress = {
          moduleName: 'Vocabulary',
          moduleNumber: 1,
          status: 'unlocked',
          lessonPlan: {
            levels: {
              '1': { answerCount: 0, correctCount: 0, unlocked: true, completed: false },
            },
          },
          lessonProgress: 0,
          practiceEmaScore: 0,
          practiceAnswerCount: 0,
          practiceCorrectCount: 0,
          moduleStrengths: [],
          moduleWeaknesses: [],
        };
        await setDoc(moduleRef, initialModule);
        setModuleData(initialModule);
      }
    } catch (err) {
      console.error('Failed to load English module:', err);
    } finally {
      setLoadingData(false);
    }
  }, [childSession]);

  useEffect(() => {
    if (childSession) loadOrCreateModule();
  }, [childSession, loadOrCreateModule]);

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

  // Count completed levels from lessonPlan
  const levels = (moduleData?.lessonPlan as { levels?: Record<string, { completed?: boolean }> })?.levels ?? {};
  const completedCount = Object.values(levels).filter((l) => l.completed).length;
  const totalAnswers = moduleData?.practiceAnswerCount ?? 0;

  return (
    <div className="dashboard-page">
      <Header
        userName={childSession.firstName}
        userType="child"
        points={childSession.totalPoints}
        onLogout={handleLogout}
      />

      <main className="dashboard-content container">
        <div className="page-header">
          <button className="btn btn-ghost" onClick={() => router.push('/child')}>
            ← Back
          </button>
          <h1>📖 English</h1>
        </div>

        {loadingData ? (
          <LoadingSpinner message="Loading modules…" />
        ) : (
          <div className="card vocab-module-card" id="module-vocabulary">
            <span className="subject-icon">📚</span>
            <h3>Vocabulary</h3>
            <p>
              Learn new words across 10 levels of increasing difficulty.
              Each level has 50 words to master through flashcards and quizzes.
            </p>

            {totalAnswers > 0 && (
              <div className="vocab-module-stats">
                <div className="stat">
                  <span className="stat-value">{completedCount} / 10</span>
                  <span className="stat-label">Levels Completed</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{totalAnswers}</span>
                  <span className="stat-label">Questions Answered</span>
                </div>
              </div>
            )}

            <button
              id="btn-vocab-start"
              className="btn btn-primary btn-lg btn-full"
              onClick={() => router.push('/child/english/vocabulary')}
            >
              {totalAnswers > 0 ? 'Continue Learning →' : '🚀 Start Learning!'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
