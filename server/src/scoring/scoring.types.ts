export interface ScorableQuestion {
  // Mirrors the QuestionType enum in prisma/schema.prisma. Kept as a local
  // union rather than imported from the generated client so scoring stays
  // free of persistence, but the values have to match or every read needs a
  // translation step that fails silently when it is forgotten.
  type: "SINGLE" | "MULTI";
  correctOptionIds: ReadonlySet<number>;
  allOptionIds: ReadonlySet<number>;
}

export interface ScoredAnswer {
  score: number; // 0..4
}
