import { z } from "zod/v4";

/**
 * The canonical quiz model. The quiz passes through named stages:
 * DraftQuiz (LLM output, no ids), Quiz (database ids), PublicQuestion
 * (ids, no isCorrect). Later stages derive from earlier stages.
 */

export const QuestionTypeSchema = z.enum(["single", "multi"]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const DraftOptionSchema = z.object({
  text: z.string().describe("The text of the option"),
  isCorrect: z.boolean().describe("Whether the option is correct"),
});
export type DraftOption = z.infer<typeof DraftOptionSchema>;

export const DraftQuestionSchema = z.object({
  text: z.string().describe("The text of the question"),
  type: QuestionTypeSchema.describe("The type of the question"),
  options: z.array(DraftOptionSchema).describe("The options for the question"),
});
export type DraftQuestion = z.infer<typeof DraftQuestionSchema>;

// The size bounds (4 options, 5 to 8 questions) do not live here. They
// are the generation contract and stay in the server GeneratedQuizSchema,
// so evals can parse a structurally bad quiz and report on it.
export const DraftQuizSchema = z.object({
  title: z.string().describe("The title of the quiz"),
  description: z.string().optional().describe("The description of the quiz"),
  questions: z.array(DraftQuestionSchema).describe("The questions in the quiz"),
});
export type DraftQuiz = z.infer<typeof DraftQuizSchema>;

// The database mints the ids. The LLM never does.
export const OptionSchema = DraftOptionSchema.extend({ id: z.uuid() });
export type Option = z.infer<typeof OptionSchema>;

export const QuestionSchema = DraftQuestionSchema.extend({
  id: z.uuid(),
  options: z.array(OptionSchema),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuizSchema = DraftQuizSchema.extend({
  id: z.uuid(),
  questions: z.array(QuestionSchema),
});
export type Quiz = z.infer<typeof QuizSchema>;

// Correct answers never leave the server (AGENTS.md hard rule 2). The
// public shapes omit isCorrect and are the only question shapes that
// cross the wire.
export const PublicOptionSchema = OptionSchema.omit({ isCorrect: true });
export type PublicOption = z.infer<typeof PublicOptionSchema>;

export const PublicQuestionSchema = QuestionSchema.extend({
  options: z.array(PublicOptionSchema),
});
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;

export const AskQuestionPayloadSchema = z.object({
  question: PublicQuestionSchema,
  index: z.int().describe("Zero-based progress position, presentation only"),
  total: z.int().describe("The number of questions in the quiz"),
  reason: z
    .string()
    .optional()
    .describe("Set on re-prompt of the same question"),
});
export type AskQuestionPayload = z.infer<typeof AskQuestionPayloadSchema>;

export const ResumeSchema = z.object({
  selections: z
    .array(z.uuid())
    .min(1)
    .max(4)
    .refine((s) => new Set(s).size === s.length, "Selections must be unique")
    .describe("The selected option ids for one question"),
});
export type Resume = z.infer<typeof ResumeSchema>;

// Records keyed by question id. The key makes a second answer for one
// question structurally impossible, and no consumer can join answers to
// questions by array index.
export const AnswersSchema = z.record(z.uuid(), z.array(z.uuid()));
export type Answers = z.infer<typeof AnswersSchema>;

export const ScoresSchema = z.record(z.uuid(), z.number());
export type Scores = z.infer<typeof ScoresSchema>;

export const StartSessionRequestSchema = z.object({
  url: z.url().describe("The url of the Markdown source document"),
});
export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

// Shape only. The semantic checks (uuid, cardinality, membership) live
// in the interrupt loop, which re-prompts with a reason instead of
// rejecting, so a stale client never gets a 400 for a wrong answer.
export const SubmitAnswerRequestSchema = z.object({
  selections: z.array(z.string()).describe("The selected option ids"),
});
export type SubmitAnswerRequest = z.infer<typeof SubmitAnswerRequestSchema>;

export const StartSessionResponseSchema = z.object({
  sessionId: z.uuid().describe("The session id; also the graph thread id"),
  question: AskQuestionPayloadSchema.describe("The first question"),
});
export type StartSessionResponse = z.infer<typeof StartSessionResponseSchema>;

export const QuizResultSchema = z.object({
  finalScore: z.number().describe("The total score for the quiz attempt"),
  scores: ScoresSchema.describe("The scores for each question"),
  attemptId: z.uuid().describe("The database id of the attempt"),
});
export type QuizResult = z.infer<typeof QuizResultSchema>;

export const SubmitAnswerResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("question"), question: AskQuestionPayloadSchema }),
  z.object({ kind: z.literal("result"), result: QuizResultSchema }),
]);
export type SubmitAnswerResponse = z.infer<typeof SubmitAnswerResponseSchema>;
