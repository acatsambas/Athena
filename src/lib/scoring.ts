/**
 * @module scoring
 * @description Exponential Moving Average (EMA) scoring engine for the Athena
 * AI tutor. Tracks student performance on a per-module basis, maps scores to
 * difficulty levels (1–8), and determines when a module is complete.
 */

// ---------------------------------------------------------------------------
// Core EMA calculations
// ---------------------------------------------------------------------------

/**
 * Calculates the adjusted answer value by subtracting the expected accuracy
 * from the binary answer outcome.
 *
 * @param isCorrect - Whether the student answered correctly.
 * @param expectedAccuracy - The probability (0–1) that the student was
 *   expected to answer correctly at the current difficulty level.
 * @returns The adjusted answer value (`answer - expectedAccuracy`), where
 *   `answer` is 1 for correct and 0 for incorrect.
 *
 * @example
 * ```ts
 * // Student got it right when expected accuracy was 60%
 * calculateAdjustedAnswer(true, 0.6);  // → 0.4
 *
 * // Student got it wrong when expected accuracy was 60%
 * calculateAdjustedAnswer(false, 0.6); // → -0.6
 * ```
 */
export function calculateAdjustedAnswer(
  isCorrect: boolean,
  expectedAccuracy: number
): number {
  const answer = isCorrect ? 1 : 0;
  return answer - expectedAccuracy;
}

/**
 * Updates the Exponential Moving Average score with a new adjusted answer.
 *
 * Formula: `EMA_new = w × EMA_old + (1 - w) × adjustedAnswer`
 *
 * @param currentEMA - The current EMA score.
 * @param adjustedAnswer - The adjusted answer value (from {@link calculateAdjustedAnswer}).
 * @param weight - The smoothing weight (0–1). Higher values make the EMA
 *   change more slowly. Defaults to `0.9`.
 * @returns The updated EMA score.
 *
 * @example
 * ```ts
 * updateEMA(0.0, 0.4);       // → 0.04
 * updateEMA(0.04, -0.6);     // → -0.024
 * updateEMA(0.0, 0.4, 0.8);  // → 0.08  (faster adaptation)
 * ```
 */
export function updateEMA(
  currentEMA: number,
  adjustedAnswer: number,
  weight: number = 0.9
): number {
  return weight * currentEMA + (1 - weight) * adjustedAnswer;
}

// ---------------------------------------------------------------------------
// Level mapping
// ---------------------------------------------------------------------------

/**
 * EMA score thresholds for mapping to levels 1–8.
 * Each entry is `[upperBound, level]`. The first range whose upper bound
 * is greater than the score determines the level.
 */
const EMA_LEVEL_THRESHOLDS: ReadonlyArray<readonly [number, number]> = [
  [-0.30, 1],
  [-0.18, 2],
  [-0.06, 3],
  [0.06, 4],
  [0.18, 5],
  [0.30, 6],
  [0.42, 7],
  // Anything above 0.42 → level 8 (handled by fallback)
];

/**
 * Maps an EMA score to a difficulty level between 1 and 8.
 *
 * | EMA range            | Level |
 * |----------------------|-------|
 * | below −0.30          | 1     |
 * | −0.30 to −0.18       | 2     |
 * | −0.18 to −0.06       | 3     |
 * | −0.06 to +0.06       | 4     |
 * | +0.06 to +0.18       | 5     |
 * | +0.18 to +0.30       | 6     |
 * | +0.30 to +0.42       | 7     |
 * | above +0.42          | 8     |
 *
 * @param emaScore - The current EMA score.
 * @returns An integer level from 1 to 8.
 */
export function emaToLevel(emaScore: number): number {
  for (const [upperBound, level] of EMA_LEVEL_THRESHOLDS) {
    if (emaScore < upperBound) {
      return level;
    }
  }
  return 8;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable performance label for a given level.
 *
 * | Level | Label              |
 * |-------|--------------------|
 * | 1–2   | Below expectations |
 * | 3–5   | On track           |
 * | 6–8   | Above expectations |
 *
 * @param level - The difficulty level (1–8).
 * @returns A descriptive label string.
 */
export function levelToLabel(level: number): string {
  if (level <= 2) {
    return "Below expectations";
  }
  if (level <= 5) {
    return "On track";
  }
  return "Above expectations";
}

// ---------------------------------------------------------------------------
// Module completion
// ---------------------------------------------------------------------------

/**
 * Determines whether a module should be considered complete.
 *
 * A module is complete when both conditions are met:
 * 1. The EMA score is at or above +0.06 (demonstrating competence).
 * 2. The student has answered at least 10 questions (ensuring sufficient data).
 *
 * @param emaScore - The current EMA score for the module.
 * @param answerCount - The total number of questions answered in the module.
 * @returns `true` if the module is complete, `false` otherwise.
 *
 * @example
 * ```ts
 * isModuleComplete(0.10, 12); // → true
 * isModuleComplete(0.10, 5);  // → false (not enough answers)
 * isModuleComplete(-0.02, 15); // → false (EMA too low)
 * ```
 */
export function isModuleComplete(
  emaScore: number,
  answerCount: number
): boolean {
  return emaScore >= 0.06 && answerCount >= 10;
}
