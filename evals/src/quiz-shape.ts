import {
  DraftQuizSchema,
  type DraftOption,
  type DraftQuestion,
  type DraftQuiz,
} from "@quizforge/shared";

/**
 * The eval quiz shape is the shared draft schema, which carries no size
 * bounds. The deterministic checks below stay here on purpose: they are
 * the structural contract of the eval and run outside the server
 * generation schema, so the eval can parse a structurally bad quiz and
 * report on it instead of failing the parse.
 */
export { DraftQuizSchema };
export type { DraftOption, DraftQuestion, DraftQuiz };

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 8;
const OPTIONS_PER_QUESTION = 4;

// A question must not reveal how many options are correct. The pattern
// matches the observed leak phrasings: a verb followed by a count
// ("select 2", "choose two", "which three"), or a bare count range
// ("2-3", "2 or 3"). "Select all that apply" does not match, because
// it does not reveal the count.
const COUNT_LEAK =
  /\b(?:select|choose|pick|mark|which)\s+(?:any\s+)?(?:the\s+)?(?:two|three|2|3)\b|\b[23]\s*(?:-|or)\s*[23]\b/i;

/** Returns one message per structural rule the quiz breaks. */
export function structuralFailures(quiz: DraftQuiz): string[] {
  const failures: string[] = [];

  const count = quiz.questions.length;
  if (count < MIN_QUESTIONS || count > MAX_QUESTIONS) {
    failures.push(`quiz has ${count} questions, expected 5 to 8`);
  }

  // Both question types must appear, so both scoring paths get
  // exercise (see the README design note on the generator).
  const types = new Set(quiz.questions.map((q) => q.type));
  if (!types.has("multi")) {
    failures.push("quiz has no multi-answer question");
  }
  if (!types.has("single")) {
    failures.push("quiz has no single-answer question");
  }

  quiz.questions.forEach((question, index) => {
    const label = `question ${index + 1}`;
    if (question.options.length !== OPTIONS_PER_QUESTION) {
      failures.push(
        `${label} has ${question.options.length} options, expected 4`,
      );
    }
    if (COUNT_LEAK.test(question.text)) {
      failures.push(`${label} reveals the number of correct answers`);
    }
    const correct = question.options.filter((o) => o.isCorrect).length;
    if (question.type === "single" && correct !== 1) {
      failures.push(
        `${label} is single-answer with ${correct} correct options, expected 1`,
      );
    }
    // Mirror the server generation schema: 2 or 3 correct. A question
    // with 4 correct options cannot separate knowledge from the
    // select-everything strategy.
    if (question.type === "multi" && (correct < 2 || correct > 3)) {
      const noun = correct === 1 ? "option" : "options";
      failures.push(
        `${label} is multi-answer with ${correct} correct ${noun}, expected 2 or 3`,
      );
    }
  });

  return failures;
}
