'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { marked } from 'marked';
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
  } | null;
}

interface LessonPlan {
  sections: LessonSection[];
}

/** Normalize an AI-generated section into our expected LessonSection shape */
function normalizeSection(raw: Record<string, unknown>): LessonSection {
  const title = (raw.title as string) || 'Untitled Section';
  const content = (raw.content as string) || (raw.explanation as string) || (raw.text as string) || '';

  // Handle knowledge_check which may come in different formats
  let knowledge_check: LessonSection['knowledge_check'] = null;

  const kc = raw.knowledge_check || raw.knowledgeCheck || raw.knowledge_Check;
  if (kc && typeof kc === 'object' && kc !== null) {
    const kcObj = kc as Record<string, unknown>;
    // Handle correct answer: might be 'correct', or might need to derive from correctIndex + options
    let correct = (kcObj.correct as string) || (kcObj.correctAnswer as string) || (kcObj.expectedAnswer as string) || '';
    const options = (kcObj.options as string[]) || [];
    if (!correct && typeof kcObj.correctIndex === 'number' && options.length > 0) {
      correct = options[kcObj.correctIndex as number] || '';
    }

    knowledge_check = {
      question: (kcObj.question as string) || '',
      type: ((kcObj.type as string) === 'free_text' ? 'free_text' : 'multiple_choice'),
      options: options.length > 0 ? options : undefined,
      correct,
      expected_accuracy: (kcObj.expected_accuracy as number) || (kcObj.expectedAccuracy as number) || 0.5,
    };
  }

  // Also handle old format where question/options/correctIndex are top-level
  if (!knowledge_check && raw.question && typeof raw.question === 'string') {
    const options = (raw.options as string[]) || [];
    let correct = '';
    if (typeof raw.correctIndex === 'number' && options.length > 0) {
      correct = options[raw.correctIndex as number] || '';
    } else if (typeof raw.correctAnswer === 'string') {
      correct = raw.correctAnswer;
    }
    knowledge_check = {
      question: raw.question as string,
      type: options.length > 0 ? 'multiple_choice' : 'free_text',
      options: options.length > 0 ? options : undefined,
      correct,
      expected_accuracy: 0.5,
    };
  }

  return { title, content, knowledge_check };
}

/** Convert markdown content to formatted HTML */
function renderContent(text: string): string {
  if (!text) return '<p><em>No content available.</em></p>';
  // Use marked to convert markdown to HTML
  const html = marked.parse(text, { async: false, breaks: true }) as string;
  return html;
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
        // Lesson plan already exists — load and normalize it
        const cached = moduleData.lessonPlan as unknown as Record<string, unknown>;
        const rawSections = (cached.sections || []) as Record<string, unknown>[];
        const sections = rawSections.map(normalizeSection);

        // If all sections have empty content, the cached plan is broken — regenerate
        if (sections.length > 0 && sections.every(s => !s.content)) {
          // Clear the broken cached plan and fall through to regeneration
          await updateDoc(moduleRef, { lessonPlan: null, lessonProgress: 0 });
        } else {
          setLessonPlan({ sections });
          setCurrentSection(moduleData.lessonProgress || 0);
          setPhase('lesson');
          return;
        }
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

      const raw = await generateJSON<Record<string, unknown>>(prompt);

      // Normalize the response — handle different AI response structures
      let sections: LessonSection[];
      const rawSections = (raw.sections || raw.lessonPlan || raw.lesson) as Record<string, unknown>[] | undefined;

      if (Array.isArray(rawSections)) {
        sections = rawSections.map(normalizeSection);
      } else if (Array.isArray(raw)) {
        sections = (raw as Record<string, unknown>[]).map(normalizeSection);
      } else {
        throw new Error('Invalid lesson plan structure from AI');
      }

      if (sections.length === 0) {
        throw new Error('AI returned an empty lesson plan');
      }

      const plan: LessonPlan = { sections };

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
                  __html: renderContent(lessonPlan.sections[currentSection].content),
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
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', alignItems: 'center' }}>
                  {currentSection > 0 && (
                    <button
                      className="btn btn-outline"
                      onClick={() => {
                        const prev = currentSection - 1;
                        setCurrentSection(prev);
                        saveProgress(prev);
                      }}
                    >
                      ← Previous
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={handleNextSection}
                  >
                    {currentSection < lessonPlan.sections.length - 1 ? 'Next →' : 'Complete Lesson ✓'}
                  </button>
                </div>
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
                  `You are a friendly maths tutor talking directly to a child born in ${childSession.yearOfBirth}. Keep your response SHORT (3-5 sentences max).

The child got this question wrong:
Question: "${diagnosticQuestion}"
They answered: "${diagnosticStudentAnswer}"
The correct answer is: "${diagnosticCorrectAnswer}"
Their explanation: "${message}"

Rules:
- Talk directly to the child in simple, encouraging language.
- Briefly explain what the correct answer is and why.
- Do NOT analyse or critique the question itself.
- Do NOT show your reasoning process.
- Do NOT use headers, sections, or long explanations.
- End with a short word of encouragement.`
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
