/**
 * @module mathematics-modules
 * @description Static definitions for the 25 mathematics modules in the Athena
 * curriculum. Modules are ordered by UK year group (Year 1 → Year 8/9) and
 * cover the full progression from basic counting through to powers, roots, and
 * prime factorisation.
 */

/** Represents a single mathematics module in the curriculum. */
export interface MathModule {
  /** Unique identifier (kebab-case), e.g. `"counting"` or `"long-division"`. */
  id: string;
  /** Sequential module number (1–25). */
  number: number;
  /** Human-readable module name. */
  name: string;
  /** Target age range, e.g. `"5-6"`. */
  ageRange: string;
  /** UK year group, e.g. `"Year 1"`. */
  yearGroup: string;
}

/**
 * The complete, ordered list of mathematics modules.
 *
 * Progression follows the UK National Curriculum year groups:
 * - Year 1 (ages 5–6): Counting, Addition, Subtraction
 * - Year 2 (ages 6–7): Simple Multiplication, Simple Division
 * - Year 3 (ages 7–8): Fractions, Basic Shapes
 * - Year 4 (ages 8–9): Area
 * - Year 5 (ages 9–10): Volume, Long Division, Place Value & Decimals, Negative Numbers
 * - Year 6 (ages 10–11): Percentages, Long Multiplication, Ratio & Proportion
 * - Year 7 (ages 11–12): Basic Algebra, Linear Equations, Angles, Perimeter, Advanced Area
 * - Year 8/9 (ages 12–13): Statistics & Data, Probability, Coordinate Geometry,
 *   Sequences & Patterns, Powers Roots & Prime Factorisation
 */
export const MATH_MODULES: readonly MathModule[] = [
  // Year 1 — Ages 5–6
  { id: "counting",                number: 1,  name: "Counting",                               ageRange: "5-6",   yearGroup: "Year 1" },
  { id: "addition",                number: 2,  name: "Addition",                                ageRange: "5-6",   yearGroup: "Year 1" },
  { id: "subtraction",             number: 3,  name: "Subtraction",                             ageRange: "5-6",   yearGroup: "Year 1" },

  // Year 2 — Ages 6–7
  { id: "simple-multiplication",   number: 4,  name: "Simple multiplication",                   ageRange: "6-7",   yearGroup: "Year 2" },
  { id: "simple-division",         number: 5,  name: "Simple division",                         ageRange: "6-7",   yearGroup: "Year 2" },

  // Year 3 — Ages 7–8
  { id: "fractions",               number: 6,  name: "Fractions",                               ageRange: "7-8",   yearGroup: "Year 3" },
  { id: "basic-shapes",            number: 7,  name: "Basic shapes",                            ageRange: "7-8",   yearGroup: "Year 3" },

  // Year 4 — Ages 8–9
  { id: "area",                    number: 8,  name: "Area",                                    ageRange: "8-9",   yearGroup: "Year 4" },

  // Year 5 — Ages 9–10
  { id: "volume",                  number: 9,  name: "Volume",                                  ageRange: "9-10",  yearGroup: "Year 5" },
  { id: "long-division",           number: 10, name: "Long division",                           ageRange: "9-10",  yearGroup: "Year 5" },
  { id: "place-value-decimals",    number: 11, name: "Place value & decimals",                  ageRange: "9-10",  yearGroup: "Year 5" },
  { id: "negative-numbers",        number: 12, name: "Negative numbers",                        ageRange: "9-10",  yearGroup: "Year 5" },

  // Year 6 — Ages 10–11
  { id: "percentages",             number: 13, name: "Percentages",                             ageRange: "10-11", yearGroup: "Year 6" },
  { id: "long-multiplication",     number: 14, name: "Long multiplication",                     ageRange: "10-11", yearGroup: "Year 6" },
  { id: "ratio-proportion",        number: 15, name: "Ratio & proportion",                      ageRange: "10-11", yearGroup: "Year 6" },

  // Year 7 — Ages 11–12
  { id: "basic-algebra",           number: 16, name: "Basic algebra",                           ageRange: "11-12", yearGroup: "Year 7" },
  { id: "linear-equations",        number: 17, name: "Linear equations",                        ageRange: "11-12", yearGroup: "Year 7" },
  { id: "angles",                  number: 18, name: "Angles",                                  ageRange: "11-12", yearGroup: "Year 7" },
  { id: "perimeter",               number: 19, name: "Perimeter",                               ageRange: "11-12", yearGroup: "Year 7" },
  { id: "advanced-area",           number: 20, name: "Advanced area",                           ageRange: "11-12", yearGroup: "Year 7" },

  // Year 8–9 — Ages 12–13
  { id: "statistics-data",         number: 21, name: "Statistics & data",                       ageRange: "12-13", yearGroup: "Year 8" },
  { id: "probability",             number: 22, name: "Probability",                             ageRange: "12-13", yearGroup: "Year 8" },
  { id: "coordinate-geometry",     number: 23, name: "Coordinate geometry",                     ageRange: "12-13", yearGroup: "Year 8" },
  { id: "sequences-patterns",      number: 24, name: "Sequences & patterns",                    ageRange: "12-13", yearGroup: "Year 8" },
  { id: "powers-roots-primes",     number: 25, name: "Powers, roots & prime factorisation",     ageRange: "12-13", yearGroup: "Year 8-9" },
] as const;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Looks up a module by its unique ID.
 *
 * @param id - The module's kebab-case identifier (e.g. `"long-division"`).
 * @returns The matching {@link MathModule}, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const mod = getModuleById("fractions");
 * // → { id: "fractions", number: 6, name: "Fractions", ageRange: "7-8", yearGroup: "Year 3" }
 * ```
 */
export function getModuleById(id: string): MathModule | undefined {
  return MATH_MODULES.find((m) => m.id === id);
}

/**
 * Returns all module names in curriculum order.
 *
 * Useful for building the ordered module list required by the assessment
 * prompt and for display in navigation UIs.
 *
 * @returns An array of module name strings, ordered by module number.
 *
 * @example
 * ```ts
 * const names = getOrderedModuleNames();
 * // → ["Counting", "Addition", "Subtraction", "Simple multiplication", ...]
 * ```
 */
export function getOrderedModuleNames(): string[] {
  return MATH_MODULES.map((m) => m.name);
}
