'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateJSON, generateContent } from '@/lib/ai-client';
import { getPracticePrompt } from '@/lib/prompts';
import { getModuleById, MATH_MODULES } from '@/data/mathematics-modules';
import { calculateAdjustedAnswer, updateEMA, emaToLevel, isModuleComplete } from '@/lib/scoring';
import type { SubjectProgress, ModuleProgress } from '@/lib/firestore-schema';
import QuestionCard from '@/components/QuestionCard';
import DiagnosticChat from '@/components/DiagnosticChat';
import ProgressBar from '@/components/ProgressBar';
import LoadingSpinner from '@/components/LoadingSpinner';

interface PracticeQuestion {
  type: 'multiple_choice' | 'free_text';
  question: string;
  options?: string[];
  correct: string;
  expected_accuracy: number;
}

/** Normalize AI response into our expected PracticeQuestion shape */
function normalizePracticeQuestion(raw: Record<string, unknown>): PracticeQuestion {
  const options = (raw.options as string[]) || [];

  // Normalize type: AI may return multipleChoice, multiple_choice, freeText, free_text
  const rawType = (raw.type as string) || '';
  const type: PracticeQuestion['type'] =
    rawType.includes('free') || rawType.includes('Free') ? 'free_text' : 'multiple_choice';

  // Normalize correct answer: may be correct, correctAnswer, or derived from correctIndex
  let correct = (raw.correct as string) || (raw.correctAnswer as string) || '';
  if (!correct && typeof raw.correctIndex === 'number' && options.length > 0) {
    correct = options[raw.correctIndex as number] || '';
  }

  return {
    type,
    question: (raw.question as string) || '',
    options: options.length > 0 ? options : undefined,
    correct,
    expected_accuracy: (raw.expected_accuracy as number) || (raw.expectedAccuracy as number) || 0.5,
  };
}

export default function PracticePage() {
  const { user, loading, userType, childSession } = useAuth();
  const router = useRouter();
  const params = useParams();
  const moduleId = params.moduleId as string;

  const [phase, setPhase] = useState<'loading' | 'answering' | 'diagnostic' | 'results' | 'error'>('loading');
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<{ correct: boolean; expectedAccuracy: number }[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [moduleCompleted, setModuleCompleted] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);

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

  // Generate practice questions
  const generateQuestions = useCallback(async () => {
    if (!childSession || !staticModule) return;

    try {
      // Load current module and subject data
      const subjectRef = doc(
        db,
        'parents', childSession.parentId,
        'children', childSession.childId,
        'subjects', 'mathematics'
      );
      const subjectSnap = await getDoc(subjectRef);
      const subjectData = subjectSnap.data() as SubjectProgress;

      const moduleRef = doc(
        db,
        'parents', childSession.parentId,
        'children', childSession.childId,
        'subjects', 'mathematics',
        'modules', moduleId
      );
      const moduleSnap = await getDoc(moduleRef);
      const moduleData = moduleSnap.data() as ModuleProgress;

      const prompt = getPracticePrompt(
        childSession.yearOfBirth,
        subjectData?.currentLevel || 4,
        staticModule.name,
        moduleData?.practiceEmaScore || 0,
        moduleData?.moduleStrengths || [],
        moduleData?.moduleWeaknesses || []
      );

      const raw = await generateJSON<Record<string, unknown>[] | { questions: Record<string, unknown>[] }>(prompt);
      const rawArr = Array.isArray(raw) ? raw : (raw as { questions: Record<string, unknown>[] }).questions;
      if (!Array.isArray(rawArr) || rawArr.length === 0) {
        throw new Error('AI returned an empty or invalid response. Please try again.');
      }

      const result = rawArr.map(normalizePracticeQuestion);
      setQuestions(result);
      setPhase('answering');
    } catch (err) {
      console.error('Failed to generate practice:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate practice questions');
      setPhase('error');
    }
  }, [childSession, moduleId, staticModule]);

  useEffect(() => {
    if (childSession && phase === 'loading') {
      generateQuestions();
    }
  }, [childSession, phase, generateQuestions]);

  const handleAnswer = async (answer: string) => {
    if (!childSession) return;

    const question = questions[currentIndex];
    const isCorrect =
      answer.toLowerCase().trim() === question.correct.toLowerCase().trim() ||
      answer.toUpperCase() === question.correct.toUpperCase();

    const newResults = [...results, { correct: isCorrect, expectedAccuracy: question.expected_accuracy }];
    setResults(newResults);

    if (isCorrect) {
      setPointsEarned((prev) => prev + 1);

      // Award point immediately
      const childRef = doc(
        db,
        'parents', childSession.parentId,
        'children', childSession.childId
      );
      const childSnap = await getDoc(childRef);
      const currentPoints = childSnap.data()?.totalPoints || 0;
      await updateDoc(childRef, { totalPoints: currentPoints + 1 });
    }

    if (!isCorrect) {
      // Trigger diagnostic
      setDiagnosticQuestion(question.question);
      setDiagnosticStudentAnswer(answer);
      setDiagnosticCorrectAnswer(question.correct);
      setPhase('diagnostic');
    } else if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Practice complete — save results
      await saveResults(newResults);
    }
  };

  const handleDiagnosticComplete = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setPhase('answering');
    } else {
      await saveResults(results);
    }
  };

  const saveResults = async (allResults: { correct: boolean; expectedAccuracy: number }[]) => {
    if (!childSession) return;

    try {
      // Update module EMA
      const moduleRef = doc(
        db,
        'parents', childSession.parentId,
        'children', childSession.childId,
        'subjects', 'mathematics',
        'modules', moduleId
      );
      const moduleSnap = await getDoc(moduleRef);
      const moduleData = moduleSnap.data() as ModuleProgress;

      let ema = moduleData?.practiceEmaScore || 0;
      for (const result of allResults) {
        const adjusted = calculateAdjustedAnswer(result.correct, result.expectedAccuracy);
        ema = updateEMA(ema, adjusted);
      }

      const newAnswerCount = (moduleData?.practiceAnswerCount || 0) + allResults.length;
      const newCorrectCount = (moduleData?.practiceCorrectCount || 0) + allResults.filter(r => r.correct).length;
      const completed = isModuleComplete(ema, newAnswerCount);

      const updateData: Record<string, unknown> = {
        practiceEmaScore: ema,
        practiceAnswerCount: newAnswerCount,
        practiceCorrectCount: newCorrectCount,
      };

      if (completed && moduleData?.status !== 'completed') {
        updateData.status = 'completed';
        setModuleCompleted(true);
      }

      await updateDoc(moduleRef, updateData);

      // Also update subject-level EMA
      const subjectRef = doc(
        db,
        'parents', childSession.parentId,
        'children', childSession.childId,
        'subjects', 'mathematics'
      );
      const subjectSnap = await getDoc(subjectRef);
      const subjectData = subjectSnap.data() as SubjectProgress;

      let subjectEma = subjectData?.emaScore || 0;
      for (const result of allResults) {
        const adjusted = calculateAdjustedAnswer(result.correct, result.expectedAccuracy);
        subjectEma = updateEMA(subjectEma, adjusted);
      }

      await updateDoc(subjectRef, {
        emaScore: subjectEma,
        currentLevel: emaToLevel(subjectEma),
        totalAnswers: (subjectData?.totalAnswers || 0) + allResults.length,
      });

      // If module completed, unlock next module
      if (completed && staticModule) {
        const nextModule = MATH_MODULES.find(m => m.number === staticModule.number + 1);
        if (nextModule) {
          const nextModuleRef = doc(
            db,
            'parents', childSession.parentId,
            'children', childSession.childId,
            'subjects', 'mathematics',
            'modules', nextModule.id
          );
          try {
            const nextSnap = await getDoc(nextModuleRef);
            if (nextSnap.exists() && nextSnap.data()?.status === 'locked') {
              await updateDoc(nextModuleRef, { status: 'unlocked' });
            }
          } catch {
            // Next module might not exist (last module)
          }
        }
      }

      setPhase('results');
    } catch (err) {
      console.error('Failed to save results:', err);
      setPhase('results'); // Still show results even if save fails
    }
  };

  if (loading || !childSession) {
    return (
      <div className="page-center">
        <LoadingSpinner message="Loading…" />
      </div>
    );
  }

  const correctCount = results.filter((r) => r.correct).length;

  return (
    <div className="practice-page">
      <main className="practice-content">
        <div className="practice-header">
          <button className="btn btn-ghost" onClick={() => router.push('/child/mathematics')}>
            ← Back
          </button>
          <h1>✏️ Practice: {staticModule?.name || 'Practice'}</h1>
        </div>

        {phase === 'loading' && (
          <div className="page-center fade-in">
            <LoadingSpinner message="Generating practice questions…" size="lg" />
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

        {phase === 'answering' && questions.length > 0 && (
          <div className="fade-in">
            <ProgressBar current={currentIndex + 1} total={questions.length} label="Questions" />

            <div style={{ marginTop: '2rem' }}>
              <QuestionCard
                key={currentIndex}
                question={questions[currentIndex].question}
                type={questions[currentIndex].type}
                options={questions[currentIndex].options}
                onAnswer={handleAnswer}
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <span className="badge badge-success">✓ {correctCount} correct</span>
            </div>
          </div>
        )}

        {phase === 'diagnostic' && (
          <div className="fade-in">
            <DiagnosticChat
              question={diagnosticQuestion}
              studentAnswer={diagnosticStudentAnswer}
              correctAnswer={diagnosticCorrectAnswer}
              onComplete={handleDiagnosticComplete}
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

        {phase === 'results' && (
          <div className="page-center fade-in">
            <div className="card practice-results">
              <div className="success-icon">{moduleCompleted ? '🏆' : '⭐'}</div>
              <h2>{moduleCompleted ? 'Module Complete!' : 'Practice Complete!'}</h2>

              {moduleCompleted && (
                <p style={{ color: 'var(--color-green)', fontWeight: 700, marginBottom: '0.5rem' }}>
                  You&apos;ve mastered {staticModule?.name}! The next module is now unlocked.
                </p>
              )}

              <div className="results-stats">
                <div className="result-stat">
                  <span className="stat-value correct-color">{correctCount}</span>
                  <span className="stat-label">Correct</span>
                </div>
                <div className="result-stat">
                  <span className="stat-value">{questions.length - correctCount}</span>
                  <span className="stat-label">Incorrect</span>
                </div>
                <div className="result-stat">
                  <span className="stat-value score-color">+{pointsEarned}</span>
                  <span className="stat-label">Points</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setPhase('loading');
                    setQuestions([]);
                    setResults([]);
                    setCurrentIndex(0);
                    setPointsEarned(0);
                    setModuleCompleted(false);
                  }}
                >
                  Practice Again
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
