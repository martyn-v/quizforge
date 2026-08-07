import { z } from "zod/v4";

/**
 * The intended full quiz shape. The server QuizSchema does not have
 * questions yet. This schema is the structural contract of the eval and
 * the acceptance test for that future schema work.
 */
export const EvalOptionSchema = z.object({
  text: z.string(),
  isCorrect: z.boolean(),
});

export const EvalQuestionSchema = z.object({
  text: z.string(),
  type: z.enum(["single", "multi"]),
  options: z.array(EvalOptionSchema),
});

export const EvalQuizSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  questions: z.array(EvalQuestionSchema),
});

export type EvalOption = z.infer<typeof EvalOptionSchema>;
export type EvalQuestion = z.infer<typeof EvalQuestionSchema>;
export type EvalQuiz = z.infer<typeof EvalQuizSchema>;

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 8;
const OPTIONS_PER_QUESTION = 4;

/** Returns one message per structural rule the quiz breaks. */
export function structuralFailures(quiz: EvalQuiz): string[] {
  const failures: string[] = [];

  const count = quiz.questions.length;
  if (count < MIN_QUESTIONS || count > MAX_QUESTIONS) {
    failures.push(`quiz has ${count} questions, expected 5 to 8`);
  }

  quiz.questions.forEach((question, index) => {
    const label = `question ${index + 1}`;
    if (question.options.length !== OPTIONS_PER_QUESTION) {
      failures.push(
        `${label} has ${question.options.length} options, expected 4`,
      );
    }
    const correct = question.options.filter((o) => o.isCorrect).length;
    if (question.type === "single" && correct !== 1) {
      failures.push(
        `${label} is single-answer with ${correct} correct options, expected 1`,
      );
    }
    if (question.type === "multi" && correct < 2) {
      failures.push(
        `${label} is multi-answer with ${correct} correct option, expected 2 or more`,
      );
    }
  });

  return failures;
}
