'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { VocabLevelProgress } from '@/lib/firestore-schema';
import { getWordsByLevel, pickRandom, VOCAB_LEVEL_COUNT } from '@/data/vocabulary-data';
import type { VocabWord } from '@/data/vocabulary-data';
import Header from '@/components/Header';
import ProgressBar from '@/components/ProgressBar';
import LoadingSpinner from '@/components/LoadingSpinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Question {
  /** 'word_to_def' = "What does X mean?"  |  'def_to_word' = "Which word means X?" */
  format: 'word_to_def' | 'def_to_word';
  targetWord: VocabWord;
  options: string[];
  correctAnswer: string;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const POINTS_PER_CORRECT = 1;
const QUESTIONS_PER_SESSION = 10;
const MIN_ANSWERS_TO_PASS = 40;
const MIN_ACCURACY_TO_PASS = 0.80;

// ---------------------------------------------------------------------------
// Build questions
// ---------------------------------------------------------------------------

function buildQuestions(levelWords: VocabWord[]): Question[] {
  const sessionWords = pickRandom(levelWords, QUESTIONS_PER_SESSION);
  const questions: Question[] = [];

  for (const word of sessionWords) {
    const format = Math.random() < 0.5 ? 'word_to_def' : 'def_to_word';

    if (format === 'word_to_def') {
      // "What does [word] mean?" → 4 definition options
      const wrongWords = levelWords.filter((w) => w.word !== word.word);
      const wrongDefs = pickRandom(wrongWords, 3).map((w) => w.definition);
      const options = pickRandom([word.definition, ...wrongDefs] as readonly string[], 4);
      questions.push({
        format: 'word_to_def',
        targetWord: word,
        options,
        correctAnswer: word.definition,
      });
    } else {
      // "Which word means [definition]?" → 4 word options
      const wrongWords = levelWords.filter((w) => w.word !== word.word);
      const wrongWordTexts = pickRandom(wrongWords, 3).map((w) => w.word);
      const options = pickRandom([word.word, ...wrongWordTexts] as readonly string[], 4);
      questions.push({
        format: 'def_to_word',
        targetWord: word,
        options,
        correctAnswer: word.word,
      });
    }
  }

  return questions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VocabPracticePage() {
  const { user, loading, userType, childSession, childLogout, signOut, refreshChildPoints } = useAuth();
  const router = useRouter();
  const params = useParams();
  const levelNum = parseInt(params.level as string, 10);

  const isValidLevel = !isNaN(levelNum) && levelNum >= 1 && levelNum <= 10;

  // sessionKey increments to force useMemo to pick fresh random words
  const [sessionKey, setSessionKey] = useState(0);

  // Build questions (re-runs when sessionKey changes)
  const questions = useMemo(() => {
    if (!isValidLevel) return [] as Question[];
    const levelWords = getWordsByLevel(levelNum);
    return buildQuestions(levelWords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelNum, isValidLevel, sessionKey]);

  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionPoints, setSessionPoints] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [levelCompleted, setLevelCompleted] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Cumulative stats loaded after session
  const [cumulativeAnswers, setCumulativeAnswers] = useState(0);
  const [cumulativeCorrect, setCumulativeCorrect] = useState(0);

  const handleLogout = async () => {
    childLogout();
    await signOut();
  };

  // ---------------------------------------------------------------------------
  // Answer handler
  // ---------------------------------------------------------------------------

  const handleAnswer = useCallback(
    async (selected: string) => {
      if (answered || !childSession) return;

      setSelectedAnswer(selected);
      setAnswered(true);
      setUpdating(true);

      const question = questions[currentQ];
      const isCorrect = selected === question.correctAnswer;

      if (isCorrect) {
        setSessionCorrect((prev) => prev + 1);
        setSessionPoints((prev) => prev + POINTS_PER_CORRECT);
      }

      const { parentId, childId } = childSession;
      const moduleRef = doc(
        db, 'parents', parentId, 'children', childId,
        'subjects', 'english', 'modules', 'vocabulary'
      );
      const childRef = doc(db, 'parents', parentId, 'children', childId);
      const subjectRef = doc(db, 'parents', parentId, 'children', childId, 'subjects', 'english');
      const lvlKey = String(levelNum);

      try {
        // Update module-level and level-specific stats
        await updateDoc(moduleRef, {
          practiceAnswerCount: increment(1),
          practiceCorrectCount: increment(isCorrect ? 1 : 0),
          [`lessonPlan.levels.${lvlKey}.answerCount`]: increment(1),
          [`lessonPlan.levels.${lvlKey}.correctCount`]: increment(isCorrect ? 1 : 0),
        });

        // Update subject total answers
        await updateDoc(subjectRef, {
          totalAnswers: increment(1),
        });

        // Award points on correct answer
        if (isCorrect) {
          await updateDoc(childRef, { totalPoints: increment(POINTS_PER_CORRECT) });
          refreshChildPoints();
        }

        // Check level completion
        const moduleSnap = await getDoc(moduleRef);
        if (moduleSnap.exists()) {
          const data = moduleSnap.data();
          const levelData = (data.lessonPlan as { levels: Record<string, VocabLevelProgress> })?.levels?.[lvlKey];

          if (levelData) {
            setCumulativeAnswers(levelData.answerCount);
            setCumulativeCorrect(levelData.correctCount);

            const accuracy = levelData.answerCount > 0
              ? levelData.correctCount / levelData.answerCount
              : 0;

            if (
              !levelData.completed &&
              levelData.answerCount >= MIN_ANSWERS_TO_PASS &&
              accuracy >= MIN_ACCURACY_TO_PASS
            ) {
              // Mark level completed & unlock next
              const updates: Record<string, unknown> = {
                [`lessonPlan.levels.${lvlKey}.completed`]: true,
              };

              if (levelNum < VOCAB_LEVEL_COUNT) {
                const nextKey = String(levelNum + 1);
                const levels = (data.lessonPlan as { levels: Record<string, VocabLevelProgress> }).levels;
                updates[`lessonPlan.levels.${nextKey}.unlocked`] = true;
                updates[`lessonPlan.levels.${nextKey}.answerCount`] = levels[nextKey]?.answerCount ?? 0;
                updates[`lessonPlan.levels.${nextKey}.correctCount`] = levels[nextKey]?.correctCount ?? 0;
                updates[`lessonPlan.levels.${nextKey}.completed`] = levels[nextKey]?.completed ?? false;
              }

              await updateDoc(moduleRef, updates);
              setLevelCompleted(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to update practice progress:', err);
      } finally {
        setUpdating(false);
      }
    },
    [answered, childSession, currentQ, questions, levelNum, refreshChildPoints]
  );

  // ---------------------------------------------------------------------------
  // Next question
  // ---------------------------------------------------------------------------

  const handleNext = useCallback(() => {
    if (currentQ + 1 >= questions.length) {
      setShowResults(true);
    } else {
      setCurrentQ((prev) => prev + 1);
      setSelectedAnswer(null);
      setAnswered(false);
    }
  }, [currentQ, questions.length]);

  // ---------------------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------------------

  if (loading || !childSession) {
    return (
      <div className="page-center">
        <LoadingSpinner message="Loading…" />
      </div>
    );
  }

  if (!isValidLevel) {
    return (
      <div className="dashboard-page">
        <Header
          userName={childSession.firstName}
          userType="child"
          points={childSession.totalPoints}
          onLogout={handleLogout}
        />
        <main className="practice-content">
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
            <h2>Invalid Level</h2>
            <p>Level must be between 1 and 10.</p>
            <button
              className="btn btn-primary"
              onClick={() => router.push('/child/english/vocabulary')}
            >
              ← Back to Levels
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Results screen
  // ---------------------------------------------------------------------------

  if (showResults) {
    const cumulativeAccuracy = cumulativeAnswers > 0
      ? Math.round((cumulativeCorrect / cumulativeAnswers) * 100)
      : 0;

    return (
      <div className="practice-page">
        <Header
          userName={childSession.firstName}
          userType="child"
          points={childSession.totalPoints}
          onLogout={handleLogout}
        />
        <main className="practice-content">
          <div className="card vocab-results">
            <div className="vocab-results-icon">
              {sessionCorrect >= 8 ? '🌟' : sessionCorrect >= 5 ? '👏' : '💪'}
            </div>
            <h2>Practice Complete!</h2>

            <div className="vocab-results-stats">
              <div className="result-stat">
                <span className="stat-value correct-color">{sessionCorrect}/{QUESTIONS_PER_SESSION}</span>
                <span className="stat-label">Correct</span>
              </div>
              <div className="result-stat">
                <span className="stat-value score-color">+{sessionPoints}</span>
                <span className="stat-label">Points</span>
              </div>
            </div>

            {levelCompleted && (
              <div className="level-complete-banner">
                <h3>🎉 Level {levelNum} Complete!</h3>
                <p>
                  {levelNum < VOCAB_LEVEL_COUNT
                    ? `Level ${levelNum + 1} is now unlocked!`
                    : 'You\'ve completed all vocabulary levels! Amazing work!'}
                </p>
              </div>
            )}

            <div className="vocab-cumulative">
              <p>
                <strong>Level {levelNum} cumulative:</strong> {cumulativeAnswers} answers, {cumulativeAccuracy}% accuracy
                {cumulativeAnswers < MIN_ANSWERS_TO_PASS && (
                  <> — need {MIN_ANSWERS_TO_PASS - cumulativeAnswers} more answers</>
                )}
                {cumulativeAnswers >= MIN_ANSWERS_TO_PASS && cumulativeAccuracy < MIN_ACCURACY_TO_PASS * 100 && (
                  <> — need {Math.round(MIN_ACCURACY_TO_PASS * 100)}% accuracy to pass</>
                )}
              </p>
            </div>

            <div className="vocab-results-actions">
              <button
                id="btn-practice-again"
                className="btn btn-primary btn-lg"
                onClick={() => {
                  setSessionKey((k) => k + 1);
                  setCurrentQ(0);
                  setSelectedAnswer(null);
                  setAnswered(false);
                  setSessionCorrect(0);
                  setSessionPoints(0);
                  setShowResults(false);
                  setLevelCompleted(false);
                }}
              >
                Practice Again
              </button>
              <button
                id="btn-practice-back"
                className="btn btn-outline"
                onClick={() => router.push('/child/english/vocabulary')}
              >
                ← Back to Levels
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Active question
  // ---------------------------------------------------------------------------

  const question = questions[currentQ];

  return (
    <div className="practice-page">
      <Header
        userName={childSession.firstName}
        userType="child"
        points={childSession.totalPoints}
        onLogout={handleLogout}
      />

      <main className="practice-content">
        <div className="practice-header">
          <button
            className="btn btn-ghost"
            onClick={() => router.push('/child/english/vocabulary')}
          >
            ← Back
          </button>
          <h1 style={{ flex: 1 }}>Level {levelNum} — Practice</h1>
        </div>

        <ProgressBar
          current={currentQ + 1}
          total={QUESTIONS_PER_SESSION}
          label={`Question ${currentQ + 1} of ${QUESTIONS_PER_SESSION}`}
        />

        <div className="vocab-step-area" style={{ marginTop: 'var(--space-6)' }}>
          <div className="vocab-check-card" key={currentQ}>
            <p className="vocab-check-question">
              {question.format === 'def_to_word'
                ? `Which word means "${question.targetWord.definition}"?`
                : `What does "${question.targetWord.word}" mean?`}
            </p>

            <div className="vocab-check-options" role="group" aria-label="Answer options">
              {question.options.map((option, idx) => {
                const label = OPTION_LABELS[idx];
                const isCorrect = option === question.correctAnswer;
                const isSelected = selectedAnswer === option;

                let optionClass = 'vocab-check-option';
                if (answered) {
                  if (isCorrect) optionClass += ' vocab-check-option-correct';
                  else if (isSelected) optionClass += ' vocab-check-option-wrong';
                }

                return (
                  <button
                    key={`${label}-${option}`}
                    id={`practice-option-${label.toLowerCase()}`}
                    type="button"
                    className={optionClass}
                    onClick={() => handleAnswer(option)}
                    disabled={answered}
                  >
                    <span className="vocab-check-option-label">{label}</span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>

            {/* Feedback */}
            {answered && (
              <>
                {selectedAnswer === question.correctAnswer ? (
                  <div className="vocab-feedback vocab-feedback-correct">
                    Correct! 🎉 +{POINTS_PER_CORRECT} points
                  </div>
                ) : (
                  <div className="vocab-feedback vocab-feedback-wrong">
                    Not quite!
                    <span className="correct-answer">
                      The correct answer is: {question.correctAnswer}
                    </span>
                  </div>
                )}

                <div className="vocab-next-btn">
                  <button
                    id="practice-next"
                    className="btn btn-primary"
                    onClick={handleNext}
                    disabled={updating}
                  >
                    {currentQ + 1 >= QUESTIONS_PER_SESSION ? 'See Results' : 'Next →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
