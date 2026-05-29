/**
 * @module prompts
 * @description AI prompt templates for every interaction mode in the Athena
 * maths tutor. Each function returns a fully-formatted prompt string ready
 * to be passed to {@link generateContent} or {@link generateJSON}.
 */

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for an initial placement assessment.
 *
 * The AI will generate a sequence of multiple-choice questions across the
 * given modules, starting easy and increasing in difficulty, to determine
 * the child's current ability level.
 *
 * @param yearOfBirth - The child's year of birth (used to infer age).
 * @param moduleList - Ordered list of module names to assess.
 * @returns The formatted assessment prompt.
 */
export function getAssessmentPrompt(
  yearOfBirth: number,
  moduleList: string[]
): string {
  const orderedModuleList = moduleList.join(", ");

  return `You are an AI tutor assessing a child's current mathematics ability. The child was born in ${yearOfBirth}. Generate a sequence of multiple-choice questions to assess their knowledge across the following mathematics topics, in order: ${orderedModuleList}.

Rules:
- Start with questions appropriate for the youngest age group and increase difficulty.
- Generate 2-3 questions per topic to make a reliable placement judgment.
- Each question must have exactly 4 answer options labelled A, B, C, D.
- Questions should be clear, unambiguous, and age-appropriate in language.
- Do not explain answers during the assessment.
- Generate at least 15 questions total.

Respond with a JSON array only (no wrapper object). Use this exact schema:
[
  {
    "module": "<module name, must match one from the list above>",
    "question": "<question text>",
    "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
    "correct": "<the exact text of the correct option>",
    "expected_accuracy": <0.0-1.0, estimated probability a child of this age gets this right>
  }
]

Respond with ONLY the JSON array. No markdown, no explanation, no wrapper object.`;
}

// ---------------------------------------------------------------------------
// Lesson Plan
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for generating a lesson plan for a specific module.
 *
 * The AI will create a Socratic, age-appropriate lesson that teaches concepts
 * first, then checks understanding with embedded knowledge checks.
 *
 * @param yearOfBirth - The child's year of birth.
 * @param level - The child's current ability level (1–8).
 * @param completedModules - Names of modules the child has already completed.
 * @param strengths - The child's demonstrated mathematical strengths.
 * @param weaknesses - The child's identified areas of difficulty.
 * @param moduleName - The name of the module to teach.
 * @returns The formatted lesson plan prompt.
 */
export function getLessonPlanPrompt(
  yearOfBirth: number,
  level: number,
  completedModules: string[],
  strengths: string[],
  weaknesses: string[],
  moduleName: string
): string {
  const completedStr =
    completedModules.length > 0 ? completedModules.join(", ") : "None";
  const strengthsStr =
    strengths.length > 0 ? strengths.join(", ") : "None identified yet";
  const weaknessesStr =
    weaknesses.length > 0 ? weaknesses.join(", ") : "None identified yet";

  return `You are an AI tutor teaching mathematics to a child.

Child profile:
- Year of birth: ${yearOfBirth}
- Current ability level: ${level} out of 8
- Modules already completed: ${completedStr}
- Demonstrated strengths: ${strengthsStr}
- Areas of difficulty: ${weaknessesStr}

Task: Generate a lesson plan to teach: ${moduleName}.

Principles:
- Be Socratic — guide the child to discover answers rather than simply telling them.
- Teach concepts and vocabulary first, then interrogate with knowledge checks.
- Calibrate difficulty to the child's level.
- Embed knowledge checks throughout the lesson.
- Where a diagram would help understanding, generate it as SVG.
- Use age-appropriate language.
- Do not use garlic in any word problems involving food.

Respond with valid JSON only. Use this schema:
{
  "lessonTitle": "<title>",
  "sections": [
    {
      "type": "explanation" | "knowledgeCheck",
      "title": "<section title>",
      "content": "<markdown content, may include SVG>",
      "question": "<optional, for knowledgeCheck type>",
      "options": ["<optional, for multiple-choice checks>"],
      "correctIndex": <optional, 0-based>,
      "expectedAnswer": "<optional, for free-text checks>"
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Practice Session
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for generating a practice question set.
 *
 * The AI produces 10 questions calibrated to the child's current EMA score,
 * focusing on areas of weakness while mixing question formats.
 *
 * @param yearOfBirth - The child's year of birth.
 * @param level - The child's current ability level (1–8).
 * @param moduleName - The module being practised.
 * @param emaScore - The child's cumulative EMA score in this module.
 * @param strengths - Demonstrated strengths within this module.
 * @param weaknesses - Areas of difficulty within this module.
 * @returns The formatted practice prompt.
 */
export function getPracticePrompt(
  yearOfBirth: number,
  level: number,
  moduleName: string,
  emaScore: number,
  strengths: string[],
  weaknesses: string[]
): string {
  const strengthsStr =
    strengths.length > 0 ? strengths.join(", ") : "None identified yet";
  const weaknessesStr =
    weaknesses.length > 0 ? weaknesses.join(", ") : "None identified yet";

  return `You are an AI tutor generating a practice session for a child.

Child profile:
- Year of birth: ${yearOfBirth}
- Current ability level: ${level} out of 8
- Module being practised: ${moduleName}
- Cumulative practice EMA score in this module: ${emaScore.toFixed(4)}
- Demonstrated strengths: ${strengthsStr}
- Areas of difficulty: ${weaknessesStr}

Task: Generate a set of 10 practice questions for ${moduleName}.

Rules:
- Mix question formats: multiple-choice and short free-text answers.
- Calibrate difficulty to the child's level.
- If EMA score is above +0.15, increase difficulty.
- If EMA score is below -0.15, reduce difficulty.
- Focus more questions on demonstrated areas of weakness.
- Questions should be varied and not repetitive.
- Use age-appropriate language.

Respond with a JSON array only (no wrapper object). Use this exact schema:
[
  {
    "type": "multiple_choice" or "free_text",
    "question": "<question text>",
    "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
    "correct": "<the exact text of the correct answer>",
    "expected_accuracy": <0.0-1.0, estimated probability the child gets this right>
  }
]

For free_text questions, omit the "options" field.
Respond with ONLY the JSON array. No markdown, no explanation, no wrapper object.`;
}

// ---------------------------------------------------------------------------
// Diagnostic Feedback
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for diagnosing a student's incorrect answer.
 *
 * The AI identifies the likely misconception, explains what went wrong, and
 * provides a clear, constructive explanation of the correct answer — all at
 * the child's reading level.
 *
 * @param question - The original question text.
 * @param studentAnswer - The answer the student gave.
 * @param correctAnswer - The correct answer.
 * @param studentExplanation - The student's own explanation of their reasoning.
 * @param yearOfBirth - The child's year of birth (used to calibrate language).
 * @returns The formatted diagnostic prompt.
 */
export function getDiagnosticPrompt(
  question: string,
  studentAnswer: string,
  correctAnswer: string,
  studentExplanation: string,
  yearOfBirth: number
): string {
  return `You are an AI maths tutor helping a child understand where they went wrong.

The child was born in ${yearOfBirth}.

Question: ${question}
Student's answer: ${studentAnswer}
Correct answer: ${correctAnswer}
Student's explanation of their reasoning: ${studentExplanation}

Task:
1. Ask the student to think about their reasoning (Socratic approach).
2. Identify the specific misconception or error in their reasoning.
3. Explain clearly what went wrong and why the correct answer is right.
4. Frame your feedback constructively and encouragingly.
5. Calibrate your language to the child's reading level based on their year of birth.

Respond with valid JSON only. Use this schema:
{
  "misconception": "<brief description of the misconception>",
  "explanation": "<clear, age-appropriate explanation of the correct approach>",
  "encouragement": "<a short encouraging message>",
  "followUpQuestion": "<optional follow-up question to check understanding>"
}`;
}

// ---------------------------------------------------------------------------
// Parent Summary
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for generating a parent-facing performance summary.
 *
 * The AI reads the child's full history and produces an accurate,
 * non-sycophantic summary that honestly reflects actual performance.
 *
 * @param childName - The child's first name.
 * @param yearOfBirth - The child's year of birth.
 * @param subjectData - An object containing the child's full performance data
 *   (module scores, EMA history, completed modules, strengths, weaknesses, etc.).
 * @returns The formatted parent summary prompt.
 */
export function getParentSummaryPrompt(
  childName: string,
  yearOfBirth: number,
  subjectData: object
): string {
  const dataJson = JSON.stringify(subjectData, null, 2);

  return `You are an AI tutor providing a progress summary to a parent.

Child's name: ${childName}
Year of birth: ${yearOfBirth}

Here is the child's full performance data in Mathematics:
${dataJson}

Task: Produce a clear, accurate, and honest summary of ${childName}'s progress in Mathematics for their parent or guardian.

Guidelines:
- Be accurate and non-sycophantic — reflect actual performance honestly.
- Highlight genuine strengths with specific examples where possible.
- Clearly identify areas that need improvement without being discouraging.
- Provide actionable suggestions for how the parent can support learning at home.
- Use plain language that any parent can understand (avoid jargon).
- Structure the summary with clear sections.

Respond with valid JSON only. Use this schema:
{
  "overallSummary": "<2-3 sentence overview>",
  "strengths": ["<specific strength with evidence>"],
  "areasForImprovement": ["<specific area with context>"],
  "modulesCompleted": <number>,
  "totalModules": <number>,
  "currentLevel": "<level label>",
  "recommendations": ["<actionable suggestion for parents>"],
  "nextSteps": "<what the child will be working on next>"
}`;
}
