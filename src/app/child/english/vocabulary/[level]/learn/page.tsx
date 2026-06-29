'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getWordsByLevel, pickRandom } from '@/data/vocabulary-data';
import type { VocabWord } from '@/data/vocabulary-data';
import Header from '@/components/Header';
import VocabFlashcard from '@/components/VocabFlashcard';
import ProgressBar from '@/components/ProgressBar';
import LoadingSpinner from '@/components/LoadingSpinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepType = 'flashcard' | 'check';

interface FlashcardStep {
  type: 'flashcard';
  word: VocabWord;
}

interface CheckStep {
  type: 'check';
  /** 'word_to_def' = "What does X mean?"  |  'def_to_word' = "Which word means X?" */
  format: 'word_to_def' | 'def_to_word';
  targetWord: VocabWord;
  options: string[];      // 4 options (words or definitions)
  correctAnswer: string;  // the correct option text
}

type Step = FlashcardStep | CheckStep;

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// Build the learn sequence
// ---------------------------------------------------------------------------

function buildSequence(sessionWords: VocabWord[]): Step[] {
  const steps: Step[] = [];
  const shownWords: VocabWord[] = [];
  let checkFormatToggle = false; // alternates between formats

  for (let i = 0; i < sessionWords.length; i++) {
    // Add flashcard
    steps.push({ type: 'flashcard', word: sessionWords[i] });
    shownWords.push(sessionWords[i]);

    // After every 2 flashcards (indices 1, 3, 5, 7), insert a knowledge check
    // But only if we have at least 4 shown words for options
    if ((i + 1) % 2 === 0 && shownWords.length >= 4) {
      const targetWord = pickRandom(shownWords, 1)[0];

      if (checkFormatToggle) {
        // Format: "What does [word] mean?" → definition options
        const wrongWords = shownWords.filter((w) => w.word !== targetWord.word);
        const wrongDefs = pickRandom(wrongWords, 3).map((w) => w.definition);
        const options = pickRandom([targetWord.definition, ...wrongDefs] as readonly string[], 4);
        steps.push({
          type: 'check',
          format: 'word_to_def',
          targetWord,
          options,
          correctAnswer: targetWord.definition,
        });
      } else {
        // Format: "Which word means [definition]?" → word options
        const wrongWords = shownWords.filter((w) => w.word !== targetWord.word);
        const wrongWordTexts = pickRandom(wrongWords, 3).map((w) => w.word);
        const options = pickRandom([targetWord.word, ...wrongWordTexts] as readonly string[], 4);
        steps.push({
          type: 'check',
          format: 'def_to_word',
          targetWord,
          options,
          correctAnswer: targetWord.word,
        });
      }

      checkFormatToggle = !checkFormatToggle;
    }
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VocabLearnPage() {
  const { user, loading, userType, childSession, childLogout, signOut } = useAuth();
  const router = useRouter();
  const params = useParams();
  const levelNum = parseInt(params.level as string, 10);

  // Validate level
  const isValidLevel = !isNaN(levelNum) && levelNum >= 1 && levelNum <= 10;

  // sessionKey increments to force useMemo to pick fresh random words
  const [sessionKey, setSessionKey] = useState(0);

  // Build session (re-runs when sessionKey changes)
  const { steps, flashcardCount } = useMemo(() => {
    if (!isValidLevel) return { steps: [] as Step[], flashcardCount: 0 };
    const levelWords = getWordsByLevel(levelNum);
    const sessionWords = pickRandom(levelWords, 10);
    const builtSteps = buildSequence(sessionWords);
    const fcCount = builtSteps.filter((s) => s.type === 'flashcard').length;
    return { steps: builtSteps, flashcardCount: fcCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelNum, isValidLevel, sessionKey]);

  const [currentStep, setCurrentStep] = useState(0);
  const [checkAnswer, setCheckAnswer] = useState<string | null>(null);
  const [checkAnswered, setCheckAnswered] = useState(false);

  // Track which flashcard number we're on (for counter display)
  const currentFlashcardNum = useMemo(() => {
    let count = 0;
    for (let i = 0; i <= currentStep && i < steps.length; i++) {
      if (steps[i].type === 'flashcard') count++;
    }
    return count;
  }, [currentStep, steps]);

  const handleLogout = async () => {
    childLogout();
    await signOut();
  };

  const handleNextStep = useCallback(() => {
    setCheckAnswer(null);
    setCheckAnswered(false);
    setCurrentStep((prev) => prev + 1);
  }, []);

  const handleCheckAnswer = useCallback(
    (selected: string) => {
      if (checkAnswered) return;
      setCheckAnswer(selected);
      setCheckAnswered(true);
    },
    [checkAnswered]
  );

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
        <main className="learn-content">
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

  const isComplete = currentStep >= steps.length;

  // ---------------------------------------------------------------------------
  // Completion screen
  // ---------------------------------------------------------------------------
  if (isComplete) {
    return (
      <div className="learn-page">
        <Header
          userName={childSession.firstName}
          userType="child"
          points={childSession.totalPoints}
          onLogout={handleLogout}
        />
        <main className="learn-content">
          <div className="card vocab-learn-summary">
            <div className="vocab-learn-summary-icon">🎉</div>
            <h2>Great job!</h2>
            <p>
              You&apos;ve reviewed {flashcardCount} words from Level {levelNum}.
              Now test yourself in Practice mode!
            </p>
            <div className="vocab-learn-summary-actions">
              <button
                id="btn-learn-continue"
                className="btn btn-primary btn-lg"
                onClick={() => {
                  setSessionKey((k) => k + 1);
                  setCurrentStep(0);
                  setCheckAnswer(null);
                  setCheckAnswered(false);
                }}
              >
                📖 Keep Learning
              </button>
              <button
                id="btn-learn-practice"
                className="btn btn-secondary"
                onClick={() => router.push(`/child/english/vocabulary/${levelNum}/practice`)}
              >
                Practice Now →
              </button>
              <button
                id="btn-learn-back"
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
  // Active step
  // ---------------------------------------------------------------------------
  const step = steps[currentStep];

  return (
    <div className="learn-page">
      <Header
        userName={childSession.firstName}
        userType="child"
        points={childSession.totalPoints}
        onLogout={handleLogout}
      />

      <main className="learn-content">
        <div className="learn-header">
          <button
            className="btn btn-ghost"
            onClick={() => router.push('/child/english/vocabulary')}
          >
            ← Back
          </button>
          <h1 style={{ flex: 1 }}>Level {levelNum} — Learn</h1>
        </div>

        <ProgressBar
          current={currentStep + 1}
          total={steps.length}
          label={`Step ${currentStep + 1} of ${steps.length}`}
        />

        <div className="vocab-step-area" style={{ marginTop: 'var(--space-6)' }}>
          {step.type === 'flashcard' && (
            <VocabFlashcard
              key={currentStep}
              word={step.word.word}
              definition={step.word.definition}
              onNext={handleNextStep}
              cardNumber={currentFlashcardNum}
              totalCards={flashcardCount}
            />
          )}

          {step.type === 'check' && (
            <div className="vocab-check-card" key={currentStep}>
              <span className="badge-check">Knowledge Check</span>

              <p className="vocab-check-question">
                {step.format === 'def_to_word'
                  ? `Which word means "${step.targetWord.definition}"?`
                  : `What does "${step.targetWord.word}" mean?`}
              </p>

              <div className="vocab-check-options" role="group" aria-label="Answer options">
                {step.options.map((option, idx) => {
                  const label = OPTION_LABELS[idx];
                  const isCorrect = option === step.correctAnswer;
                  const isSelected = checkAnswer === option;

                  let optionClass = 'vocab-check-option';
                  if (checkAnswered) {
                    if (isCorrect) optionClass += ' vocab-check-option-correct';
                    else if (isSelected) optionClass += ' vocab-check-option-wrong';
                  }

                  return (
                    <button
                      key={`${label}-${option}`}
                      id={`check-option-${label.toLowerCase()}`}
                      type="button"
                      className={optionClass}
                      onClick={() => handleCheckAnswer(option)}
                      disabled={checkAnswered}
                    >
                      <span className="vocab-check-option-label">{label}</span>
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>

              {/* Feedback */}
              {checkAnswered && (
                <>
                  {checkAnswer === step.correctAnswer ? (
                    <div className="vocab-feedback vocab-feedback-correct">
                      Correct! 🎉
                    </div>
                  ) : (
                    <div className="vocab-feedback vocab-feedback-wrong">
                      Not quite!
                      <span className="correct-answer">
                        The correct answer is: {step.correctAnswer}
                      </span>
                    </div>
                  )}

                  <div className="vocab-next-btn">
                    <button
                      id="check-next"
                      className="btn btn-primary"
                      onClick={handleNextStep}
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
