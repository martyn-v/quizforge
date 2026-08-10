// Shared domain types for quizforge. The SSE event union lands here
// with Phase 3.5 (see docs/PLAN.md).

export const SHARED_PACKAGE = "@quizforge/shared";

// The extensionless specifier is deliberate: the swc-node dev runner
// does not resolve "./quiz.js" style imports to .ts sources (see the
// importFileExtension note in server/prisma/schema.prisma). That is
// also why this package declares no "type": "module".
//
// The exports are named one by one, not "export *". This package
// compiles to CommonJS, and Node detects named exports in a CommonJS
// module by static analysis. A compiled "export *" hides the names, so
// an ESM consumer (the evals package) fails at import time. An explicit
// list keeps the names visible. Add new exports here by name.
export {
  QuestionTypeSchema,
  DraftOptionSchema,
  DraftQuestionSchema,
  DraftQuizSchema,
  OptionSchema,
  QuestionSchema,
  QuizSchema,
  PublicOptionSchema,
  PublicQuestionSchema,
  AskQuestionPayloadSchema,
  ResumeSchema,
  AnswersSchema,
  ScoresSchema,
  StartSessionRequestSchema,
  SubmitAnswerRequestSchema,
  StartSessionResponseSchema,
  QuizResultSchema,
  SubmitAnswerResponseSchema,
} from "./quiz";
export type {
  QuestionType,
  DraftOption,
  DraftQuestion,
  DraftQuiz,
  Option,
  Question,
  Quiz,
  PublicOption,
  PublicQuestion,
  AskQuestionPayload,
  Resume,
  Answers,
  Scores,
  StartSessionRequest,
  SubmitAnswerRequest,
  StartSessionResponse,
  QuizResult,
  SubmitAnswerResponse,
} from "./quiz";
