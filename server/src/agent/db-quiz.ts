import type { Quiz } from "@quizforge/shared";
import { fromDbQuestionType, type DbQuestionType } from "./question-type-map";

/**
 * The row shape the mapper needs. It is structural on purpose: both the
 * create read-back in persistQuiz and the findFirst result in loadQuiz
 * satisfy it, and neither node imports Prisma helper types for it.
 * The questions and options must already be ordered by position.
 */
export interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  questions: {
    id: string;
    text: string;
    type: DbQuestionType;
    options: { id: string; text: string; isCorrect: boolean }[];
  }[];
}

/** Maps one database row to the domain Quiz shape. */
export function toQuiz(row: QuizRow): Quiz {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    questions: row.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: fromDbQuestionType(q.type),
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
      })),
    })),
  };
}
