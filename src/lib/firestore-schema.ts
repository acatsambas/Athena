import { Timestamp } from "firebase/firestore";

// ===============================================================
// Firestore Data Model – Athena AI Tutor
// ===============================================================
//
// Collection hierarchy:
//   parents/{parentId}
//     └─ children/{childId}
//          └─ subjects/{subjectId}
//               └─ modules/{moduleId}
//
// ===============================================================

/** AI model provider options */
export type AIModel = "openai" | "anthropic" | "gemini";

/** Module completion status */
export type ModuleStatus = "locked" | "unlocked" | "completed";

// ---------------------------------------------------------------
// Parent Profile
// ---------------------------------------------------------------

/**
 * Top-level document representing a parent user.
 * Path: parents/{parentId}
 * The document ID matches the Firebase Auth UID.
 */
export interface ParentProfile {
  /** The parent's email address (from Firebase Auth) */
  email: string;
  /** The parent's display name */
  displayName: string;
  /** Preferred AI model provider for tutoring sessions */
  aiModel: AIModel;
  /** When the parent account was created */
  createdAt: Timestamp;
}

// ---------------------------------------------------------------
// Child Profile
// ---------------------------------------------------------------

/**
 * Subcollection document representing a child under a parent.
 * Path: parents/{parentId}/children/{childId}
 */
export interface ChildProfile {
  /** Unique username for the child */
  username: string;
  /** The child's first name */
  firstName: string;
  /** Year of birth (e.g., 2015) */
  yearOfBirth: number;
  /** 6-digit PIN for child login, stored as a hash */
  pin: string;
  /** Cumulative points earned across all subjects */
  totalPoints: number;
  /** When the child profile was created */
  createdAt: Timestamp;
}

// ---------------------------------------------------------------
// Subject Progress
// ---------------------------------------------------------------

/**
 * Subcollection document tracking a child's progress in a subject.
 * Path: parents/{parentId}/children/{childId}/subjects/{subjectId}
 */
export interface SubjectProgress {
  /** Whether the initial assessment has been completed */
  assessmentComplete: boolean;
  /** Current difficulty level (1–8) */
  currentLevel: number;
  /** Exponential moving average score for adaptive difficulty */
  emaScore: number;
  /** Total number of answers across all sessions */
  totalAnswers: number;
  /** Topics / skills the child excels at */
  strengths: string[];
  /** Topics / skills that need improvement */
  weaknesses: string[];
}

// ---------------------------------------------------------------
// Vocabulary Level Progress (stored inside ModuleProgress.lessonPlan)
// ---------------------------------------------------------------

/**
 * Tracks per-level progress within the Vocabulary module.
 * Stored as a map inside the ModuleProgress document's `lessonPlan` field:
 * `lessonPlan: { levels: Record<string, VocabLevelProgress> }`
 */
export interface VocabLevelProgress {
  /** Number of practice answers submitted at this level */
  answerCount: number;
  /** Number of correct answers at this level */
  correctCount: number;
  /** Whether this level is unlocked */
  unlocked: boolean;
  /** Whether this level is completed (passed) */
  completed: boolean;
}

// ---------------------------------------------------------------
// Module Progress
// ---------------------------------------------------------------

/**
 * Subcollection document tracking progress within a specific module.
 * Path: parents/{parentId}/children/{childId}/subjects/{subjectId}/modules/{moduleId}
 */
export interface ModuleProgress {
  /** Human-readable module name */
  moduleName: string;
  /** Ordinal position of the module (1-based) */
  moduleNumber: number;
  /** Whether the module is locked, unlocked, or completed */
  status: ModuleStatus;
  /**
   * AI-generated lesson plan, null until generated.
   * For the Vocabulary module, this stores level progress:
   * `{ levels: Record<string, VocabLevelProgress> }`
   */
  lessonPlan: Record<string, unknown> | null;
  /** Percentage of the lesson completed (0–100) */
  lessonProgress: number;
  /** Exponential moving average score for practice questions */
  practiceEmaScore: number;
  /** Number of practice answers submitted in this module */
  practiceAnswerCount: number;
  /** Number of correct practice answers in this module */
  practiceCorrectCount: number;
  /** Module-specific strengths identified during practice */
  moduleStrengths: string[];
  /** Module-specific weaknesses identified during practice */
  moduleWeaknesses: string[];
}

// ---------------------------------------------------------------
// Firestore Collection Path Helpers
// ---------------------------------------------------------------

/** Helper constants for Firestore collection paths */
export const COLLECTIONS = {
  PARENTS: "parents",
  children: (parentId: string) =>
    `parents/${parentId}/children` as const,
  subjects: (parentId: string, childId: string) =>
    `parents/${parentId}/children/${childId}/subjects` as const,
  modules: (parentId: string, childId: string, subjectId: string) =>
    `parents/${parentId}/children/${childId}/subjects/${subjectId}/modules` as const,
} as const;
