'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { doc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateJSON } from '@/lib/ai-client';
import { getAssessmentPrompt } from '@/lib/prompts';
import { getOrderedModuleNames, MATH_MODULES } from '@/data/mathematics-modules';
import { calculateAdjustedAnswer, updateEMA, emaToLevel } from '@/lib/scoring';
import QuestionCard from '@/components/QuestionCard';
import ProgressBar from '@/components/ProgressBar';
import LoadingSpinner from '@/components/LoadingSpinner';

interface AssessmentQuestion {
  module: string;
  question: string;
  options: string[];
  correct: string;
  expected_accuracy: number;
}

export default function AssessmentPage() {
  const { user, loading, userType, childSession } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<'loading' | 'ready' | 'answering' | 'complete' | 'error'>('loading');
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<{ correct: boolean; expectedAccuracy: number; module: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!loading && (!user || userType !== 'child' || !childSession)) {
      router.push('/login');
    }
  }, [user, loading, userType, childSession, router]);

  // Generate assessment questions
  useEffect(() => {
    if (!childSession || phase !== 'loading') return;

    const generateQuestions = async () => {
      try {
        const moduleNames = getOrderedModuleNames();
        const prompt = getAssessmentPrompt(childSession.yearOfBirth, moduleNames);

        const result = await generateJSON<AssessmentQuestion[]>(prompt);
        if (!Array.isArray(result) || result.length === 0) {
          throw new Error('Invalid response from AI');
        }

        setQuestions(result);
        setPhase('ready');
      } catch (err) {
        console.error('Assessment generation failed:', err);
        setErrorMsg(err instanceof Error ? err.message : 'Failed to generate assessment');
        setPhase('error');
      }
    };

    generateQuestions();
  }, [childSession, phase]);

  const handleAnswer = (answer: string) => {
    const question = questions[currentIndex];
    const isCorrect = answer.toUpperCase() === question.correct.toUpperCase();

    setAnswers((prev) => [
      ...prev,
      {
        correct: isCorrect,
        expectedAccuracy: question.expected_accuracy,
        module: question.module,
      },
    ]);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Assessment complete — process results
      processResults([
        ...answers,
        {
          correct: isCorrect,
          expectedAccuracy: question.expected_accuracy,
          module: question.module,
        },
      ]);
    }
  };

  const processResults = async (
    allAnswers: { correct: boolean; expectedAccuracy: number; module: string }[]
  ) => {
    if (!childSession) return;
    setPhase('complete');

    try {
      // Calculate overall EMA
      let emaScore = 0;
      let totalAnswerCount = 0;

      for (const ans of allAnswers) {
        const adjusted = calculateAdjustedAnswer(ans.correct, ans.expectedAccuracy);
        emaScore = updateEMA(emaScore, adjusted);
        totalAnswerCount++;
      }

      const level = emaToLevel(emaScore);

      // Determine which modules to unlock based on performance
      // Find the highest module where the child demonstrated competence
      const modulePerformance: Record<string, { correct: number; total: number }> = {};
      for (const ans of allAnswers) {
        if (!modulePerformance[ans.module]) {
          modulePerformance[ans.module] = { correct: 0, total: 0 };
        }
        modulePerformance[ans.module].total++;
        if (ans.correct) modulePerformance[ans.module].correct++;
      }

      // Find highest module with > 50% correct
      let highestUnlockedIndex = 0;
      for (let i = 0; i < MATH_MODULES.length; i++) {
        const mod = MATH_MODULES[i];
        const perf = modulePerformance[mod.name];
        if (perf && perf.correct / perf.total > 0.5) {
          highestUnlockedIndex = i + 1; // Unlock the NEXT module (they've shown mastery of this one)
        } else {
          break; // Stop at first module they didn't demonstrate
        }
      }

      // Ensure at least the first module is unlocked
      highestUnlockedIndex = Math.max(highestUnlockedIndex, 0);

      // Save subject data
      const subjectRef = doc(
        db,
        'parents',
        childSession.parentId,
        'children',
        childSession.childId,
        'subjects',
        'mathematics'
      );

      await setDoc(subjectRef, {
        assessmentComplete: true,
        currentLevel: level,
        emaScore,
        totalAnswers: totalAnswerCount,
        strengths: Object.entries(modulePerformance)
          .filter(([, perf]) => perf.correct / perf.total >= 0.7)
          .map(([mod]) => mod),
        weaknesses: Object.entries(modulePerformance)
          .filter(([, perf]) => perf.total > 0 && perf.correct / perf.total < 0.5)
          .map(([mod]) => mod),
      });

      // Create module documents
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

      for (let i = 0; i < MATH_MODULES.length; i++) {
        const mod = MATH_MODULES[i];
        let status: 'locked' | 'unlocked' | 'completed';

        if (i < highestUnlockedIndex) {
          status = 'completed'; // Below assessed level = mark as completed
        } else if (i === highestUnlockedIndex) {
          status = 'unlocked'; // Current level = unlocked
        } else {
          status = 'locked';
        }

        await setDoc(doc(modulesRef, mod.id), {
          moduleName: mod.name,
          moduleNumber: mod.number,
          status,
          lessonPlan: null,
          lessonProgress: 0,
          practiceEmaScore: 0,
          practiceAnswerCount: 0,
          moduleStrengths: [],
          moduleWeaknesses: [],
        });
      }

      // Redirect to subject page after a brief delay
      setTimeout(() => {
        router.push('/child/mathematics');
      }, 3000);
    } catch (err) {
      console.error('Failed to process results:', err);
      setErrorMsg('Failed to save results. Please try again.');
      setPhase('error');
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
    <div className="assessment-page">
      <main className="assessment-content container">
        {phase === 'loading' && (
          <div className="page-center fade-in">
            <LoadingSpinner message="Preparing your assessment questions…" size="lg" />
            <p className="text-muted" style={{ marginTop: '1rem' }}>
              This may take a moment while we create personalised questions for you.
            </p>
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
              <button className="btn btn-outline" onClick={() => router.push('/child')}>
                Go Back
              </button>
            </div>
          </div>
        )}

        {(phase === 'ready' || phase === 'answering') && questions.length > 0 && (
          <div className="assessment-quiz fade-in">
            <div className="quiz-header">
              <h1>Let&apos;s see what you know!</h1>
              <ProgressBar current={currentIndex + 1} total={questions.length} label="Questions" />
            </div>

            <div className="quiz-topic">
              <span className="topic-badge">{questions[currentIndex].module}</span>
            </div>

            <QuestionCard
              question={questions[currentIndex].question}
              type="multiple_choice"
              options={questions[currentIndex].options}
              onAnswer={(answer) => {
                setPhase('answering');
                handleAnswer(answer);
              }}
            />
          </div>
        )}

        {phase === 'complete' && (
          <div className="page-center fade-in">
            <div className="card success-card">
              <div className="success-icon">🎉</div>
              <h2>Assessment Complete!</h2>
              <p>
                Great job, {childSession.firstName}! We&apos;ve figured out the best starting
                point for you. Let&apos;s start learning!
              </p>
              <LoadingSpinner message="Setting up your modules…" size="sm" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
