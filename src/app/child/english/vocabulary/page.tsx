'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { VocabLevelProgress } from '@/lib/firestore-schema';
import { VOCAB_LEVEL_COUNT } from '@/data/vocabulary-data';
import Header from '@/components/Header';
import VocabLevelCard from '@/components/VocabLevelCard';
import LoadingSpinner from '@/components/LoadingSpinner';

interface LevelDisplay {
  level: number;
  status: 'locked' | 'unlocked' | 'completed';
  answerCount: number;
  correctCount: number;
}

export default function VocabularyPage() {
  const { user, loading, userType, childSession, childLogout, signOut } = useAuth();
  const router = useRouter();
  const [levels, setLevels] = useState<LevelDisplay[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && (userType !== 'child' || !childSession)) {
      router.push('/login');
    }
  }, [user, loading, userType, childSession, router]);

  const loadLevels = useCallback(async () => {
    if (!childSession) return;

    const { parentId, childId } = childSession;

    try {
      const moduleRef = doc(
        db, 'parents', parentId, 'children', childId,
        'subjects', 'english', 'modules', 'vocabulary'
      );
      const snap = await getDoc(moduleRef);

      if (!snap.exists()) {
        // Redirect to English page which will auto-create
        router.push('/child/english');
        return;
      }

      const data = snap.data();
      const storedLevels = (data.lessonPlan as { levels?: Record<string, VocabLevelProgress> })?.levels ?? {};

      // Build display data for all 10 levels
      const displayLevels: LevelDisplay[] = [];

      for (let i = 1; i <= VOCAB_LEVEL_COUNT; i++) {
        const stored = storedLevels[String(i)];

        if (stored) {
          displayLevels.push({
            level: i,
            status: stored.completed ? 'completed' : stored.unlocked ? 'unlocked' : 'locked',
            answerCount: stored.answerCount,
            correctCount: stored.correctCount,
          });
        } else {
          // Level 1 defaults to unlocked, everything else locked
          displayLevels.push({
            level: i,
            status: i === 1 ? 'unlocked' : 'locked',
            answerCount: 0,
            correctCount: 0,
          });
        }
      }

      // Auto-fix: if a level is completed but next is locked, unlock it
      for (let i = 0; i < displayLevels.length - 1; i++) {
        if (displayLevels[i].status === 'completed' && displayLevels[i + 1].status === 'locked') {
          displayLevels[i + 1].status = 'unlocked';
          const nextLevel = String(displayLevels[i + 1].level);
          await updateDoc(moduleRef, {
            [`lessonPlan.levels.${nextLevel}.unlocked`]: true,
            [`lessonPlan.levels.${nextLevel}.answerCount`]: displayLevels[i + 1].answerCount,
            [`lessonPlan.levels.${nextLevel}.correctCount`]: displayLevels[i + 1].correctCount,
            [`lessonPlan.levels.${nextLevel}.completed`]: false,
          });
        }
      }

      setLevels(displayLevels);
    } catch (err) {
      console.error('Failed to load vocabulary levels:', err);
    } finally {
      setLoadingData(false);
    }
  }, [childSession, router]);

  useEffect(() => {
    if (childSession) loadLevels();
  }, [childSession, loadLevels]);

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
          <button className="btn btn-ghost" onClick={() => router.push('/child/english')}>
            ← Back
          </button>
          <h1>📚 Vocabulary</h1>
        </div>

        {loadingData ? (
          <LoadingSpinner message="Loading levels…" />
        ) : (
          <div className="modules-grid">
            {levels.map((lvl) => (
              <VocabLevelCard
                key={lvl.level}
                level={lvl.level}
                status={lvl.status}
                wordCount={50}
                answerCount={lvl.answerCount}
                correctCount={lvl.correctCount}
                onLearn={() => router.push(`/child/english/vocabulary/${lvl.level}/learn`)}
                onPractice={() => router.push(`/child/english/vocabulary/${lvl.level}/practice`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
