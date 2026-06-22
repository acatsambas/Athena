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
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearOfBirth;
  const orderedModuleList = moduleList.join(", ");

  return `You are an AI tutor assessing a child's current mathematics ability. The child is ${age} years old (born ${yearOfBirth}). Generate a sequence of multiple-choice questions to assess their knowledge across the following mathematics topics, in order: ${orderedModuleList}.

Rules:
- Start with questions appropriate for the youngest age group and increase difficulty.
- Generate 2-3 questions per topic to make a reliable placement judgment.
- Each question must have exactly 4 answer options labelled A, B, C, D.
- Questions MUST use simple, age-appropriate language for a ${age}-year-old. Keep question text short and clear.
- Do not explain answers during the assessment.
- Generate at least 15 questions total.
- Do not use garlic in any word problems involving food.

Respond with a JSON array only (no wrapper object). Use this exact schema:
[
  {
    "module": "<module name, must match one from the list above>",
    "question": "<question text — keep it short and simple>",
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
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearOfBirth;
  const completedStr =
    completedModules.length > 0 ? completedModules.join(", ") : "None";
  const strengthsStr =
    strengths.length > 0 ? strengths.join(", ") : "None identified yet";
  const weaknessesStr =
    weaknesses.length > 0 ? weaknesses.join(", ") : "None identified yet";

  // Tailor vocabulary and tone guidance to the child's age
  let languageGuidance: string;
  if (age <= 6) {
    languageGuidance = `The child is ${age} years old. Use very simple words (Year 1–2 reading level). Short sentences of 5–8 words. Use fun, playful language like you are talking to a small child. Use lots of examples with pictures described in words (e.g. "Imagine you have 3 apples 🍎🍎🍎").`;
  } else if (age <= 8) {
    languageGuidance = `The child is ${age} years old. Use simple, clear language (Year 3–4 reading level). Keep sentences under 12 words where possible. Explain new words when you first use them. Use relatable everyday examples (sweets, toys, pocket money).`;
  } else if (age <= 10) {
    languageGuidance = `The child is ${age} years old. Use clear, straightforward language (Year 5–6 reading level). You can use basic maths vocabulary but always explain it briefly on first use. Examples should feel relevant to their daily life.`;
  } else {
    languageGuidance = `The child is ${age} years old. Use clear language suitable for a secondary school student. Maths terminology is fine but define any specialist words. You can use slightly more complex sentence structures.`;
  }

  return `You are a friendly AI maths tutor teaching a child.

Child profile:
- Age: ${age} years old (born ${yearOfBirth})
- Current ability level: ${level} out of 8
- Modules already completed: ${completedStr}
- Demonstrated strengths: ${strengthsStr}
- Areas of difficulty: ${weaknessesStr}

Language and tone:
${languageGuidance}

Task: Generate a lesson to teach: ${moduleName}.

CRITICAL formatting rules — you MUST follow these:
1. Each section must be SHORT — maximum 3 to 5 sentences of content. Never write a wall of text.
2. Introduce only ONE small idea per section. Do not cram multiple concepts together.
3. Use line breaks between sentences to make reading easy.
4. Start with something the child already knows, then build ONE step forward.
5. Use a concrete example or analogy in every teaching section.
6. Generate 8 to 12 short sections in total, alternating between teaching and knowledge checks.
7. At least 4 sections must have a knowledge_check.
8. Knowledge checks should be simple and test the ONE idea just taught.

Teaching principles:
- Be Socratic — ask the child to think before revealing answers.
- Be warm, encouraging, and conversational — write as if chatting to the child.
- Use emoji sparingly to keep things friendly (1–2 per section max).
- Do not use garlic in any word problems involving food.

Respond with valid JSON only. Use this exact schema:
{
  "sections": [
    {
      "title": "<short, friendly section title>",
      "content": "<lesson content — MAXIMUM 3-5 sentences, plain text with line breaks>",
      "knowledge_check": null or {
        "question": "<question text>",
        "type": "multiple_choice" or "free_text",
        "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
        "correct": "<the exact text of the correct answer>",
        "expected_accuracy": <0.0-1.0>
      }
    }
  ]
}

Important:
- Each section MUST have a "content" field with the teaching content as plain text.
- Sections without a knowledge check should have "knowledge_check": null.
- Keep every "content" value SHORT. If you find yourself writing more than 5 sentences, split it into two sections.
- Do NOT use markdown formatting in content — use plain text only.
- Respond with ONLY the JSON object. No markdown, no explanation.`;
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
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearOfBirth;
  const strengthsStr =
    strengths.length > 0 ? strengths.join(", ") : "None identified yet";
  const weaknessesStr =
    weaknesses.length > 0 ? weaknesses.join(", ") : "None identified yet";

  return `You are an AI tutor generating a practice session for a ${age}-year-old child.

Child profile:
- Age: ${age} years old (born ${yearOfBirth})
- Current ability level: ${level} out of 8
- Module being practised: ${moduleName}
- Cumulative practice EMA score in this module: ${emaScore.toFixed(4)}
- Demonstrated strengths: ${strengthsStr}
- Areas of difficulty: ${weaknessesStr}

Task: Generate a set of 5 practice questions for ${moduleName}.

Rules:
- Mix question formats: multiple-choice and short free-text answers.
- Calibrate difficulty to the child's level.
- If EMA score is above +0.15, increase difficulty.
- If EMA score is below -0.15, reduce difficulty.
- Focus more questions on demonstrated areas of weakness.
- Questions should be varied and not repetitive.
- Use simple, clear language appropriate for a ${age}-year-old. Keep questions short.
- Do not use garlic in any word problems involving food.

Respond with a JSON array only (no wrapper object). Use this exact schema:
[
  {
    "type": "multiple_choice" or "free_text",
    "question": "<question text — keep it short and age-appropriate>",
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
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearOfBirth;

  return `You are a friendly AI maths tutor helping a ${age}-year-old child understand where they went wrong.

Question: ${question}
Student's answer: ${studentAnswer}
Correct answer: ${correctAnswer}
Student's explanation of their reasoning: ${studentExplanation}

Task:
1. Ask the student to think about their reasoning (Socratic approach).
2. Identify the specific misconception or error in their reasoning.
3. Explain clearly what went wrong and why the correct answer is right.
4. Frame your feedback constructively and encouragingly.
5. Use simple language appropriate for a ${age}-year-old. Keep sentences short.

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
