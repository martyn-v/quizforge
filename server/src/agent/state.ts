import { StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import {
  AnswersSchema,
  DraftQuizSchema,
  QuizSchema,
  ScoresSchema,
} from "@quizforge/shared";

const QuizState = new StateSchema({
  readme_url: z.string().describe("The URL of the README file for the quiz"),
  source: z
    .string()
    .default("")
    .describe("The Markdown that fetchSource retrieved from readme_url"),
  draft: DraftQuizSchema.optional().describe(
    "The quiz that generateQuestions generated, before ids exist",
  ),
  quiz: QuizSchema.optional().describe(
    "The persisted quiz with database ids, from persistQuiz",
  ),
  // An ISO string, not a Date: the checkpoint serializer revives a Date
  // as a plain string, so a Date type here would lie after a round trip.
  startedAt: z
    .string()
    .optional()
    .describe("The ISO time the attempt started, stamped by persistQuiz"),
  answers: AnswersSchema.default({}).describe(
    "The selected option ids per question id, from askQuestion",
  ),
  scores: ScoresSchema.default({}).describe(
    "The score per question id, from scoreAnswers",
  ),
  finalScore: z
    .number()
    .optional()
    .describe("The final score for the quiz, from scoreAnswers"),
  attemptId: z
    .uuid()
    .optional()
    .describe("The id of the attempt, from finalize"),
});

export { QuizState };
