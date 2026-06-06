'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ModuleProgress } from '@/lib/firestore-schema';
import { MATH_MODULES } from '@/data/mathematics-modules';
import Header from '@/components/Header';
import ModuleCard from '@/components/ModuleCard';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function MathematicsPage() {
  const { user, loading, userType, childSession, childLogout, signOut } = useAuth();
  const router = useRouter();
  const [modules, setModules] = useState<(ModuleProgress & { id: string })[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);

  useEffect(() => {
    if (!loading && (!user || userType !== 'child' || !childSession)) {
      router.push('/login');
    }
  }, [user, loading, userType, childSession, router]);

  const loadModules = useCallback(async () => {
    if (!childSession) return;

    try {
      const modulesRef = collection(
        db,
        'parents',
        childSession.parentId,
        'children',
        childSession.childId,
        'subjects',
        'mathematics',
        'modules'
      );
      const snap = await getDocs(modulesRef);
      const data = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as ModuleProgress),
        }))
        .sort((a, b) => a.moduleNumber - b.moduleNumber);

      // Auto-fix: if a module is completed but the next one is locked, unlock it
      for (let i = 0; i < data.length - 1; i++) {
        if (data[i].status === 'completed' && data[i + 1].status === 'locked') {
          const nextModuleRef = doc(modulesRef, data[i + 1].id);
          await updateDoc(nextModuleRef, { status: 'unlocked' });
          data[i + 1].status = 'unlocked';
        }
      }

      setModules(data);
    } catch (err) {
      console.error('Failed to load modules:', err);
    } finally {
      setLoadingModules(false);
    }
  }, [childSession]);

  useEffect(() => {
    if (childSession) loadModules();
  }, [childSession, loadModules]);

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

  // Build display data: merge stored modules with static module list
  const displayModules = MATH_MODULES.map((staticMod) => {
    const stored = modules.find((m) => m.id === staticMod.id || m.moduleNumber === staticMod.number);
    return {
      id: staticMod.id,
      number: staticMod.number,
      name: staticMod.name,
      ageRange: staticMod.ageRange,
      status: (stored?.status || 'locked') as 'locked' | 'unlocked' | 'completed',
    };
  });

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
          <h1>📐 Mathematics</h1>
        </div>

        {loadingModules ? (
          <LoadingSpinner message="Loading modules…" />
        ) : (
          <div className="modules-grid">
            {displayModules.map((mod) => (
              <ModuleCard
                key={mod.id}
                module={mod}
                onLearn={() => router.push(`/child/mathematics/${mod.id}/learn`)}
                onPractice={() => router.push(`/child/mathematics/${mod.id}/practice`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
