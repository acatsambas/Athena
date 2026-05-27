'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateJSON, generateContent } from '@/lib/ai-client';
import { getLessonPlanPrompt } from '@/lib/prompts';
import { getModuleById } from '@/data/mathematics-modules';
import { calculateAdjustedAnswer, updateEMA, emaToLevel } from '@/lib/scoring';
import type { SubjectProgress, ModuleProgress } from '@/lib/firestore-schema';
import QuestionCard from '@/components/QuestionCard';
import DiagnosticChat from '@/components/DiagnosticChat';
import ProgressBar from '@/components/ProgressBar';
import LoadingSpinner from '@/components/LoadingSpinner';

interface LessonSection {
  title: string;
  content: string;
  svg?: string;
  knowledge_check?: {
    question: string;
    type: 'multiple_choice' | 'free_text';
    options?: string[];
    correct: string;
    expected_accuracy: number;
  };
}

interface LessonPlan {
  sections: LessonSection[];
}

export default function LearnPage() {
  const { user, loading, userType, childSession } = useAuth();
  const router = useRouter();
  const params = useParams();
  const moduleId = params.moduleId as string;

  const [phase, setPhase] = useState<'loading' | 'lesson' | 'check' | 'diagnostic' | 'complete' | 'error'>('loading');
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [showQuestion, setShowQuestion] = useState(false);
  const [questionInput, setQuestionInput] = useState('');
  const [questionAnswer, setQuestionAnswer] = useState('');
  const [loadingQuestion, setLoadingQuestion] = useState(false);

  // Diagnostic state
  const [diagnosticQuestion, setDiagnosticQuestion] = useState('');
  const [diagnosticStudentAnswer, setDiagnosticStudentAnswer] = useState('');
  const [diagnosticCorrectAnswer, setDiagnosticCorrectAnswer] = useState('');

  const staticModule = getModuleById(moduleId);

  useEffect(() => {
    if (!loading && (!user || userType !== 'child' || !childSession)) {
      router.push('/login');
    }
  }, [user, loading, userType, childSession, router]);

  // Load or generate lesson plan
  const loadLessonPlan = useCallback(async () => {
    if (!childSession || !staticModule) return;

    try {
      const moduleRef = doc(
        db,
        'parents', childSession.parentId,
        'children', childSession.childId,
        'subjects', 'mathematics',
        'modules', moduleId
      );
      const moduleSnap = await getDoc(moduleRef);

      if (!moduleSnap.exists()) {
        setErrorMsg('Module not found');
        setPhase('error');
        return;
      }

      const moduleData = moduleSnap.data() as ModuleProgress;

      if (moduleData.lessonPlan) {
        // Lesson plan already exists — load it
        setLessonPlan(moduleData.lessonPlan as unknown as LessonPlan);
        setCurrentSection(moduleData.lessonProgress || 0);
        setPhase('lesson');
        return;
      }

      // Generate new lesson plan
      const subjectRef = doc(
        db,
        'parents', childSession.parentId,
        'children', childSession.childId,
        'subjects', 'mathematics'
      );
      const subjectSnap = await getDoc(subjectRef);
      const subjectData = subjectSnap.data() as SubjectProgress;

      const prompt = getLessonPlanPrompt(
        childSession.yearOfBirth,
        subjectData?.currentLevel || 4,
        subjectData?.strengths || [],
        subjectData?.strengths || [],
        subjectData?.weaknesses || [],
        staticModule.name
      );

      const plan = await generateJSON<LessonPlan>(prompt);
      if (!plan || !plan.sections || plan.sections.length === 0) {
        throw new Error('Invalid lesson plan received from AI');
      }

      // Save to Firestore
      await updateDoc(moduleRef, { lessonPlan: plan, lessonProgress: 0 });

      setLessonPlan(plan);
      setCurrentSection(0);
      setPhase('lesson');
    } catch (err) {
      console.error('Failed to load lesson plan:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate lesson plan');
      setPhase('error');
    }
  }, [childSession, moduleId, staticModule]);

  useEffect(() => {
    if (childSession && phase === 'loading') {
      loadLessonPlan();
    }
  }, [childSession, phase, loadLessonPlan]);

  // Save progress to Firestore
  const saveProgress = useCallback(async (sectionIndex: number) => {
    if (!childSession) return;
    const moduleRef = doc(
      db,
      'parents', childSession.parentId,
      'children', childSession.childId,
      'subjects', 'mathematics',
      'modules', moduleId
    );
    await updateDoc(moduleRef, { lessonProgress: sectionIndex });
  }, [childSession, moduleId]);

  const handleKnowledgeCheckAnswer = async (answer: string) => {
    if (!lessonPlan) return;
    const section = lessonPlan.sections[currentSection];
    if (!section.knowledge_check) return;

    const isCorrect =
      answer.toLowerCase().trim() === section.knowledge_check.correct.toLowerCase().trim() ||
      answer.toUpperCase() === section.knowledge_check.correct.toUpperCase();

    if (isCorrect) {
      // Award point
      if (childSession) {
        const childRef = doc(
          db,
          'parents', childSession.parentId,
          'children', childSession.childId
        );
        const childSnap = await getDoc(childRef);
        const currentPoints = childSnap.data()?.totalPoints || 0;
        await updateDoc(childRef, { totalPoints: currentPoints + 1 });
      }

      // Update EMA
      if (childSession) {
        const subjectRef = doc(
          db,
          'parents', childSession.parentId,
          'children', childSession.childId,
          'subjects', 'mathematics'
        );
        const subjectSnap = await getDoc(subjectRef);
        const subjectData = subjectSnap.data() as SubjectProgress;
        const adjusted = calculateAdjustedAnswer(true, section.knowledge_check.expected_accuracy);
        const newEma = updateEMA(subjectData?.emaScore || 0, adjusted);
        const newLevel = emaToLevel(newEma);
        await updateDoc(subjectRef, {
          emaScore: newEma,
          currentLevel: newLevel,
          totalAnswers: (subjectData?.totalAnswers || 0) + 1,
        });
      }

      // Move to next section
      handleNextSection();
    } else {
      // Trigger diagnostic
      setDiagnosticQuestion(section.knowledge_check.question);
      setDiagnosticStudentAnswer(answer);
      setDiagnosticCorrectAnswer(section.knowledge_check.correct);
      setPhase('diagnostic');
    }
  };

  const handleNextSection = () => {
    if (!lessonPlan) return;

    if (currentSection < lessonPlan.sections.length - 1) {
      const next = currentSection + 1;
      setCurrentSection(next);
      saveProgress(next);
      setPhase('lesson');
    } else {
      setPhase('complete');
    }
  };

  const handleAskQuestion = async () => {
    if (!questionInput.trim()) return;
    setLoadingQuestion(true);

    try {
      const context = lessonPlan
        ? `The student is learning about ${staticModule?.name}. Current section: ${lessonPlan.sections[currentSection]?.title}. Content: ${lessonPlan.sections[currentSection]?.content}`
        : '';

      const answer = await generateContent(
        `A student (born ${childSession?.yearOfBirth}) is learning mathematics and asks: "${questionInput}"\n\nContext: ${context}\n\nAnswer their question clearly at their reading level, then encourage them to continue the lesson.`
      );

      setQuestionAnswer(answer);
    } catch (err) {
      setQuestionAnswer('Sorry, I couldn\'t answer that question right now. Please try again.');
    } finally {
      setLoadingQuestion(false);
    }
  };

  if (loading || !childSession) {
    return (
      <div className="page-center">
        <LoadingSpinner message="Loading…" />
      </div>
    );
  }

  return (
    <div className="learn-page">
      <main className="learn-content">
        <div className="learn-header">
          <button className="btn btn-ghost" onClick={() => router.push('/child/mathematics')}>
            ← Back
          </button>
          <h1>📖 {staticModule?.name || 'Learn'}</h1>
        </div>

        {phase === 'loading' && (
          <div className="page-center fade-in">
            <LoadingSpinner message="Preparing your lesson…" size="lg" />
          </div>
        )}

        {phase === 'error' && (
          <div className="page-center fade-in">
            <div className="card error-card">
              <h2>Something went wrong</h2>
              <p>{errorMsg}</p>
              <button className="btn btn-primary" onClick={() => { setPhase('loading'); setErrorMsg(''); }}>
                Try Again
              </button>
            </div>
          </div>
        )}

        {phase === 'lesson' && lessonPlan && (
          <div className="fade-in">
            <ProgressBar
              current={currentSection + 1}
              total={lessonPlan.sections.length}
              label="Sections"
            />

            <div className="card" style={{ marginTop: '1.5rem' }}>
              <h2>{lessonPlan.sections[currentSection].title}</h2>
              <div
                className="lesson-content"
                style={{ marginTop: '1rem', lineHeight: '1.8' }}
                dangerouslySetInnerHTML={{
                  __html: lessonPlan.sections[currentSection].content
                    + (lessonPlan.sections[currentSection].svg || ''),
                }}
              />

              {lessonPlan.sections[currentSection].knowledge_check ? (
                <div style={{ marginTop: '2rem' }}>
                  <h3>Knowledge Check</h3>
                  <QuestionCard
                    question={lessonPlan.sections[currentSection].knowledge_check.question}
                    type={lessonPlan.sections[currentSection].knowledge_check.type || 'multiple_choice'}
                    options={lessonPlan.sections[currentSection].knowledge_check.options}
                    onAnswer={handleKnowledgeCheckAnswer}
                  />
                </div>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '2rem' }}
                  onClick={handleNextSection}
                >
                  {currentSection < lessonPlan.sections.length - 1 ? 'Next →' : 'Complete Lesson ✓'}
                </button>
              )}
            </div>

            {/* Floating Ask Question Button */}
            <button
              className="btn btn-secondary"
              style={{
                position: 'fixed',
                bottom: '2rem',
                right: '2rem',
                borderRadius: '50px',
                padding: '0.75rem 1.5rem',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 100,
              }}
              onClick={() => setShowQuestion(!showQuestion)}
            >
              ❓ Ask a Question
            </button>

            {/* Question Panel */}
            {showQuestion && (
              <div className="card fade-in" style={{
                position: 'fixed',
                bottom: '5rem',
                right: '2rem',
                width: '360px',
                maxHeight: '400px',
                overflow: 'auto',
                zIndex: 100,
                boxShadow: 'var(--shadow-xl)',
              }}>
                <h3 style={{ marginBottom: '0.75rem' }}>Ask a Question</h3>
                <div className="form-group">
                  <textarea
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    placeholder="What would you like to know?"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      fontFamily: 'var(--font-ui)',
                      fontSize: 'var(--text-sm)',
                      resize: 'vertical',
                    }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleAskQuestion}
                    disabled={loadingQuestion || !questionInput.trim()}
                  >
                    {loadingQuestion ? 'Thinking…' : 'Ask'}
                  </button>
                </div>
                {questionAnswer && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: 'var(--color-primary-50)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-sm)',
                  }}>
                    {questionAnswer}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {phase === 'diagnostic' && (
          <div className="fade-in">
            <DiagnosticChat
              question={diagnosticQuestion}
              studentAnswer={diagnosticStudentAnswer}
              correctAnswer={diagnosticCorrectAnswer}
              onComplete={() => handleNextSection()}
              generateResponse={async (message: string) => {
                const resp = await generateContent(
                  `A student (born ${childSession.yearOfBirth}) answered a maths question incorrectly.

Question: ${diagnosticQuestion}
Their answer: ${diagnosticStudentAnswer}
Correct answer: ${diagnosticCorrectAnswer}
Their explanation of their reasoning: "${message}"

Identify their specific misconception. Explain clearly what went wrong and why the correct answer is right. Be constructive and use age-appropriate language.`
                );
                return resp;
              }}
            />
          </div>
        )}

        {phase === 'complete' && (
          <div className="page-center fade-in">
            <div className="card success-card">
              <div className="success-icon">🎓</div>
              <h2>Lesson Complete!</h2>
              <p>Great work! You&apos;ve finished this lesson. Ready to practise what you&apos;ve learned?</p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => router.push(`/child/mathematics/${moduleId}/practice`)}
                >
                  Start Practising →
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => router.push('/child/mathematics')}
                >
                  Back to Modules
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
