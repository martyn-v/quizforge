import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod/v4";
import type { DraftQuestion, DraftQuiz } from "../quiz-shape.ts";
import { withRateLimitRetry, isRateLimitError } from "../rate-limit.ts";

export const QuestionVerdictSchema = z.object({
  answerable: z
    .boolean()
    .describe("True only if the source alone answers the question"),
  singleDefensibleAnswer: z
    .boolean()
    .describe("True only if the marked answers are the only defensible ones"),
  distractorsPlausible: z
    .boolean()
    .describe("True if wrong options are wrong but on topic"),
  reasoning: z.string().describe("One or two sentences of justification"),
});

export const CoverageVerdictSchema = z.object({
  keyTopics: z
    .array(z.string())
    .describe("The 5 to 10 key topics of the source document"),
  coveredTopics: z
    .array(z.string())
    .describe("The subset of keyTopics that the quiz asks about"),
});

export type QuestionVerdict = z.infer<typeof QuestionVerdictSchema>;
export type CoverageVerdict = z.infer<typeof CoverageVerdictSchema>;

const QUESTION_SYSTEM_PROMPT = `
You are a strict quiz reviewer. You receive a source document and one quiz question.
Judge the question only against the source document. Do not use outside knowledge as evidence.
Rules:
- answerable: true only if the source document alone contains the facts needed to answer.
  If the question needs outside knowledge, or contradicts the source, set false.
- singleDefensibleAnswer: for a single-answer question, true only if exactly one option is
  defensible given the source. For a multi-answer question, true only if the marked correct
  options are exactly the defensible ones.
- distractorsPlausible: true if every incorrect option is wrong per the source but stays on
  topic. Set false if any incorrect option is absurd or unrelated.
- reasoning: one or two sentences.
`;

const COVERAGE_SYSTEM_PROMPT = `
You are a strict quiz reviewer. You receive a source document and the questions of a quiz.
First list the 5 to 10 key topics of the document.
Then list which of those key topics at least one question asks about.
Use the same topic strings in both lists.
`;

/** Invokes the model with schema validation and one repair round. */
async function invokeJudge<Schema extends z.ZodType>(
  llm: BaseChatModel,
  schema: Schema,
  system: string,
  request: string,
): Promise<z.infer<Schema>> {
  const model = llm.withStructuredOutput(schema);
  const messages = [new SystemMessage(system), new HumanMessage(request)];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return schema.parse(
        await withRateLimitRetry(() => model.invoke(messages)),
      );
    } catch (error) {
      if (isRateLimitError(error)) {
        throw error;
      }
      if (attempt === 2) {
        throw new Error(
          `Judge output did not match the schema after ${attempt} attempts`,
          { cause: error },
        );
      }
      messages.push(
        new HumanMessage(
          "Your previous response did not match the required schema. Respond again and follow the schema exactly.",
        ),
      );
    }
  }
  throw new Error("unreachable");
}

function formatQuestion(question: DraftQuestion): string {
  const options = question.options
    .map(
      (option, index) =>
        `${index + 1}. ${option.text}${option.isCorrect ? " (marked correct)" : ""}`,
    )
    .join("\n");
  return `Question (${question.type}-answer): ${question.text}\nOptions:\n${options}`;
}

/** Judges one question against the source document. */
export function judgeQuestion(
  llm: BaseChatModel,
  source: string,
  question: DraftQuestion,
): Promise<QuestionVerdict> {
  const request = `Source document:\n${source}\n\n${formatQuestion(question)}`;
  return invokeJudge(
    llm,
    QuestionVerdictSchema,
    QUESTION_SYSTEM_PROMPT,
    request,
  );
}

/** Judges topic coverage of the whole quiz against the source document. */
export function judgeCoverage(
  llm: BaseChatModel,
  source: string,
  quiz: DraftQuiz,
): Promise<CoverageVerdict> {
  const questions = quiz.questions
    .map((q, i) => `${i + 1}. ${q.text}`)
    .join("\n");
  const request = `Source document:\n${source}\n\nQuiz questions:\n${questions}`;
  return invokeJudge(
    llm,
    CoverageVerdictSchema,
    COVERAGE_SYSTEM_PROMPT,
    request,
  );
}
