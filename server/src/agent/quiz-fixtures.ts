import type { DraftQuiz, Quiz } from "@quizforge/shared";

/**
 * Deterministic quiz fixtures for the agent specs. The ids are fixed
 * valid uuids: question ids carry marker 1, option ids carry marker 2,
 * so the two can never collide.
 *
 * The correct options sit at varied positions on purpose. A mapping
 * that rebuilds ids from a filtered array produces the same sets when
 * every correct option leads its question; this fixture catches that.
 */

export function qid(q: number): string {
  return `00000000-0000-4000-8000-1${String(q).padStart(11, "0")}`;
}

export function oid(q: number, o: number): string {
  return `00000000-0000-4000-8000-2${String(q * 100 + o).padStart(11, "0")}`;
}

const QUESTIONS = [
  { text: "Question 1", type: "single", correct: [2] },
  { text: "Question 2", type: "multi", correct: [1, 3] },
  { text: "Question 3", type: "single", correct: [0] },
  { text: "Question 4", type: "multi", correct: [0, 1] },
  { text: "Question 5", type: "single", correct: [3] },
] as const;

export function makeDraft(): DraftQuiz {
  return {
    title: "hello",
    description: "this is a quiz",
    questions: QUESTIONS.map((q) => ({
      text: q.text,
      type: q.type,
      options: [0, 1, 2, 3].map((o) => ({
        text: `Option ${o + 1}`,
        isCorrect: (q.correct as readonly number[]).includes(o),
      })),
    })),
  };
}

export function makeQuiz(quizId: string): Quiz {
  const draft = makeDraft();
  return {
    id: quizId,
    title: draft.title,
    description: draft.description,
    questions: draft.questions.map((q, qi) => ({
      id: qid(qi),
      text: q.text,
      type: q.type,
      options: q.options.map((o, oi) => ({
        id: oid(qi, oi),
        text: o.text,
        isCorrect: o.isCorrect,
      })),
    })),
  };
}

/** The row shape prisma.quiz.create returns with the nested include. */
export function makeDbQuiz(quizId: string) {
  const draft = makeDraft();
  return {
    id: quizId,
    sourceUrl: "https://raw.githubusercontent.com/owner/repo/main/README.md",
    title: draft.title,
    description: draft.description ?? null,
    strategy: "strategy",
    model: "modelName",
    createdAt: new Date(),
    questions: draft.questions.map((q, qi) => ({
      id: qid(qi),
      quizId,
      position: qi,
      type: q.type === "single" ? ("SINGLE" as const) : ("MULTI" as const),
      text: q.text,
      options: q.options.map((o, oi) => ({
        id: oid(qi, oi),
        questionId: qid(qi),
        position: oi,
        text: o.text,
        isCorrect: o.isCorrect,
      })),
    })),
  };
}
