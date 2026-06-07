'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateContent } from '@/lib/ai-client';
import type { ChildProfile, SubjectProgress, ModuleProgress } from '@/lib/firestore-schema';
import Header from '@/components/Header';
import LoadingSpinner from '@/components/LoadingSpinner';

interface ChildData extends ChildProfile {
  id: string;
  subjects: (SubjectProgress & { id: string; modules: (ModuleProgress & { id: string })[] })[];
  aiSummary?: string;
}

export default function ParentDashboard() {
  const { user, loading, userType, signOut, getApiKey, getAiModel } = useAuth();
  const router = useRouter();
  const [children, setChildren] = useState<ChildData[]>([]);
  const [expandedChild, setExpandedChild] = useState<string | null>(null);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [modelInput, setModelInput] = useState('');

  // Redirect if not authenticated as parent
  useEffect(() => {
    if (!loading && (!user || userType !== 'parent')) {
      router.push('/login');
    }
  }, [user, loading, userType, router]);

  // Load children data
  const loadChildren = useCallback(async () => {
    if (!user) return;

    try {
      const childrenRef = collection(db, 'parents', user.uid, 'children');
      const childrenSnap = await getDocs(childrenRef);

      const childrenData: ChildData[] = [];

      for (const childDoc of childrenSnap.docs) {
        const childData = childDoc.data() as ChildProfile;

        // Load subjects
        const subjectsRef = collection(db, 'parents', user.uid, 'children', childDoc.id, 'subjects');
        const subjectsSnap = await getDocs(subjectsRef);

        const subjects = [];
        for (const subjectDoc of subjectsSnap.docs) {
          const subjectData = subjectDoc.data() as SubjectProgress;

          // Load modules
          const modulesRef = collection(
            db, 'parents', user.uid, 'children', childDoc.id, 'subjects', subjectDoc.id, 'modules'
          );
          const modulesSnap = await getDocs(modulesRef);
          const modules = modulesSnap.docs.map((m) => ({
            id: m.id,
            ...(m.data() as ModuleProgress),
          }));

          subjects.push({
            id: subjectDoc.id,
            ...subjectData,
            modules: modules.sort((a, b) => a.moduleNumber - b.moduleNumber),
          });
        }

        childrenData.push({
          id: childDoc.id,
          ...childData,
          subjects,
        });
      }

      setChildren(childrenData);

      // Auto-create child_logins lookup docs for any children missing them
      const parentSnap = await getDoc(doc(db, 'parents', user.uid));
      const parentData = parentSnap.data();
      for (const child of childrenData) {
        try {
          const loginRef = doc(db, 'child_logins', child.username);
          const loginSnap = await getDoc(loginRef);
          if (!loginSnap.exists()) {
            await setDoc(loginRef, {
              parentId: user.uid,
              childId: child.id,
              firstName: child.firstName,
              yearOfBirth: child.yearOfBirth,
              pin: child.pin,
              aiModel: parentData?.aiModel || '',
              totalPoints: child.totalPoints || 0,
            });
          }
        } catch {
          // Non-critical
        }
      }
    } catch (err) {
      console.error('Failed to load children:', err);
    } finally {
      setLoadingChildren(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadChildren();
  }, [user, loadChildren]);

  // Generate AI summary for a child
  const generateSummary = async (child: ChildData) => {
    const apiKey = getApiKey();
    const model = getAiModel();
    if (!apiKey || !model) return;

    setLoadingSummary(child.id);
    try {
      const subjectData = child.subjects.map((s) => ({
        subject: s.id,
        level: s.currentLevel,
        emaScore: s.emaScore,
        totalAnswers: s.totalAnswers,
        strengths: s.strengths,
        weaknesses: s.weaknesses,
        modules: s.modules.map((m) => {
          const correctCount = (m as ModuleProgress & { practiceCorrectCount?: number }).practiceCorrectCount;
          const pct = (correctCount != null && m.practiceAnswerCount > 0)
            ? Math.round(correctCount / m.practiceAnswerCount * 100)
            : null;
          return {
            name: m.moduleName,
            status: m.status,
            practicePercentCorrect: pct,
            practiceCount: m.practiceAnswerCount,
          };
        }),
      }));

      const prompt = `You are generating a parent-facing performance summary for a child using an AI tutor.

Child: ${child.firstName} (born ${child.yearOfBirth})
Total points: ${child.totalPoints}

Subject data:
${JSON.stringify(subjectData, null, 2)}

Generate an accurate, non-sycophantic summary. Report on:
1. Overall progress and current ability level
2. Specific strengths demonstrated
3. Areas needing improvement
4. Recommendations for next steps

Be honest and constructive. Do not default to positive framing if the data does not support it.
Keep the summary concise (3-5 paragraphs).`;

      const summary = await generateContent(prompt);
      setChildren((prev) =>
        prev.map((c) => (c.id === child.id ? { ...c, aiSummary: summary } : c))
      );
    } catch (err) {
      console.error('Failed to generate summary:', err);
    } finally {
      setLoadingSummary(null);
    }
  };

  const getLevelLabel = (level: number) => {
    if (level <= 2) return 'Below expectations';
    if (level <= 5) return 'On track';
    return 'Above expectations';
  };

  const getLevelClass = (level: number) => {
    if (level <= 2) return 'status-below';
    if (level <= 5) return 'status-on-track';
    return 'status-above';
  };

  if (loading || loadingChildren) {
    return (
      <div className="page-center">
        <LoadingSpinner message="Loading dashboard…" />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <Header
        userName={user?.displayName || user?.email || 'Parent'}
        userType="parent"
        onLogout={signOut}
      />

      <main className="dashboard-content container">
        <div className="dashboard-header">
          <h1>Parent Dashboard</h1>
          <div className="dashboard-actions">
            <button
              id="btn-add-child"
              className="btn btn-primary"
              onClick={() => router.push('/parent/add-child')}
            >
              + Add Child
            </button>
            <button
              id="btn-settings"
              className="btn btn-outline"
              onClick={() => setShowSettings(!showSettings)}
            >
              ⚙️ Settings
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="card settings-panel fade-in">
            <h2>Settings</h2>
            <div className="form-group">
              <label htmlFor="settings-model">AI Model</label>
              <select
                id="settings-model"
                value={modelInput || getAiModel() || ''}
                onChange={(e) => setModelInput(e.target.value)}
              >
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="settings-apikey">API Key</label>
              <input
                id="settings-apikey"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Enter new API key to update"
              />
              <span className="form-hint">Your API key is stored locally and never sent to our servers.</span>
            </div>
            <button
              id="btn-save-settings"
              className="btn btn-primary"
              onClick={() => {
                if (apiKeyInput) {
                  localStorage.setItem('athena_api_key', apiKeyInput);
                  setApiKeyInput('');
                }
                if (modelInput) {
                  localStorage.setItem('athena_ai_model', modelInput);
                }
                setShowSettings(false);
              }}
            >
              Save Settings
            </button>
          </div>
        )}

        {/* Children List */}
        {children.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-icon">👧🧒</div>
            <h2>No children yet</h2>
            <p>Add a child account to get started with personalised learning.</p>
            <button
              className="btn btn-primary"
              onClick={() => router.push('/parent/add-child')}
            >
              + Add Child
            </button>
          </div>
        ) : (
          <div className="children-list">
            {children.map((child) => (
              <div key={child.id} className="card child-card">
                <div
                  className="child-header"
                  onClick={() => {
                    const newExpanded = expandedChild === child.id ? null : child.id;
                    setExpandedChild(newExpanded);
                    if (newExpanded && !child.aiSummary) {
                      generateSummary(child);
                    }
                  }}
                >
                  <div className="child-info">
                    <h2>{child.firstName}</h2>
                    <span className="child-username">@{child.username}</span>
                  </div>
                  <div className="child-points">
                    <span className="points-value">⭐ {child.totalPoints || 0}</span>
                    <span className="points-label">points</span>
                  </div>
                  <span className={`chevron ${expandedChild === child.id ? 'open' : ''}`}>▼</span>
                </div>

                {expandedChild === child.id && (
                  <div className="child-details fade-in">
                    {/* AI Summary */}
                    <div className="summary-section">
                      <h3>Performance Summary</h3>
                      {loadingSummary === child.id ? (
                        <LoadingSpinner message="Generating AI summary…" size="sm" />
                      ) : child.aiSummary ? (
                        <div className="ai-summary">
                          {child.aiSummary.split('\n').map((paragraph, i) => (
                            <p key={i}>{paragraph}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted">No data available yet.</p>
                      )}
                    </div>

                    {/* Subjects */}
                    {child.subjects.length > 0 ? (
                      child.subjects.map((subject) => (
                        <div key={subject.id} className="subject-row">
                          <div
                            className="subject-header"
                            onClick={() =>
                              setExpandedSubject(
                                expandedSubject === `${child.id}-${subject.id}` ? null : `${child.id}-${subject.id}`
                              )
                            }
                          >
                            <span className="subject-name">{subject.id}</span>
                            <span className={`status-badge ${getLevelClass(subject.currentLevel)}`}>
                              {subject.assessmentComplete ? getLevelLabel(subject.currentLevel) : 'N/A'}
                            </span>
                            <span className={`chevron ${expandedSubject === `${child.id}-${subject.id}` ? 'open' : ''}`}>
                              ▼
                            </span>
                          </div>

                          {expandedSubject === `${child.id}-${subject.id}` && (
                            <div className="subject-details fade-in">
                              {subject.strengths && subject.strengths.length > 0 && (
                                <p><strong>Strengths:</strong> {subject.strengths.join(', ')}</p>
                              )}
                              {subject.weaknesses && subject.weaknesses.length > 0 && (
                                <p><strong>Areas for improvement:</strong> {subject.weaknesses.join(', ')}</p>
                              )}

                              <div className="modules-table">
                                <div className="table-header">
                                  <span>Module</span>
                                  <span>Status</span>
                                  <span>Score</span>
                                </div>
                                {subject.modules.map((mod) => (
                                  <div key={mod.id} className="table-row">
                                    <span>{mod.moduleName}</span>
                                    <span className={`status-badge status-${mod.status}`}>
                                      {mod.status}
                                    </span>
                                    <span>
                                      {mod.practiceAnswerCount > 0
                                        ? (() => {
                                            const cc = (mod as ModuleProgress & { practiceCorrectCount?: number }).practiceCorrectCount;
                                            return cc != null
                                              ? `${Math.round(cc / mod.practiceAnswerCount * 100)}%`
                                              : `${mod.practiceAnswerCount} answered`;
                                          })()
                                        : '—'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-muted">No subjects started yet.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
