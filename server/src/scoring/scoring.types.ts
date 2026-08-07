import type { QuestionType } from "@quizforge/shared";

export interface ScorableQuestion {
  // The domain spelling ("single" | "multi") from shared. The Prisma
  // enum spelling exists only behind question-type-map.ts in the agent
  // package; scoring stays free of persistence.
  type: QuestionType;
  correctOptionIds: ReadonlySet<string>;
  allOptionIds: ReadonlySet<string>;
}

export interface ScoredAnswer {
  score: number; // 0..4
}
