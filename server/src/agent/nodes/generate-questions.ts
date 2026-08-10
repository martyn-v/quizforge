import { GraphNode } from "@langchain/langgraph";
import { QuizState } from "../state";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { OutputParserException } from "@langchain/core/output_parsers";
import { z } from "zod/v4";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GeneratedQuizSchema } from "../agent.schemas";
import { GenerateQuestionsError } from "../../common/errors";

const SYSTEM_PROMPT = `
You are a helpful assistant that generates questions for a quiz based on the source material provided.
The source material is in Markdown format.
Generate questions that are clear, concise, and relevant to the content of the source material.

Rules:
- Generate 5 to 8 questions.
- Each question must have exactly 4 options.
- Each question must have at least one correct option.
- Each question must be either a single-choice or multiple-choice question.
- The quiz must have a mix of single-choice and multiple-choice questions.
- Multi-choice questions must have 2 or 3 correct options.
- Multi-choice questions must not leak the number of correct options in the question text.
- The questions and options must be in English.
`;

/**
 * True when the provider rejected a malformed tool call from the model.
 * Groq validates the JSON of a tool call on the server. A malformed call
 * returns a 400 with the code "tool_use_failed", not a local parse error.
 * The check reads the error body by shape, so this file stays free of
 * provider imports. It accepts both body nestings the SDK produces.
 */
function isToolUseFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const body = (
    error as { error?: { code?: unknown; error?: { code?: unknown } } }
  ).error;
  return (
    body?.code === "tool_use_failed" || body?.error?.code === "tool_use_failed"
  );
}

/**
 * True when the error is a LangChain parser failure, read by shape.
 * The evals runner loads a second ESM copy of @langchain/core next to
 * the server CommonJS copy. An OutputParserException from the other
 * copy fails instanceof, but the lc_error_code field survives.
 */
function isParserFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { lc_error_code?: unknown }).lc_error_code ===
      "OUTPUT_PARSING_FAILURE"
  );
}

/** True when the model answered but the output does not match the schema. */
function isSchemaFailure(error: unknown): boolean {
  return (
    error instanceof z.ZodError ||
    error instanceof OutputParserException ||
    error instanceof SyntaxError ||
    isParserFailure(error) ||
    isToolUseFailure(error)
  );
}

function describeFailure(error: unknown): string {
  if (error instanceof z.ZodError) {
    return z.prettifyError(error);
  }
  return error instanceof Error ? error.message : String(error);
}

export function makeGenerateQuestionsNode(
  llm: BaseChatModel,
  max_attempts = 2,
): GraphNode<typeof QuizState> {
  return async (state) => {
    const model = llm.withStructuredOutput(GeneratedQuizSchema);

    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(state.source),
    ];

    for (let attempt = 1; ; attempt++) {
      try {
        const result = await model.invoke(messages);
        return {
          draft: GeneratedQuizSchema.parse(result),
          generationRetries: attempt - 1,
        };
      } catch (error) {
        if (!isSchemaFailure(error)) {
          throw new GenerateQuestionsError(
            `Model call failed: ${describeFailure(error)}`,
            { cause: error },
          );
        }
        if (attempt >= max_attempts) {
          // No failure detail here: a parser failure embeds the raw
          // model output, isCorrect flags included, and this message
          // crosses the wire in error responses (AGENTS.md rule 2).
          // The cause keeps the detail for logs and traces.
          throw new GenerateQuestionsError(
            `The model output did not match the quiz schema after ${attempt} attempt(s)`,
            { cause: error },
          );
        }
        messages.push(
          new HumanMessage(
            `Your previous response did not match the required schema:\n${describeFailure(error)}\nGenerate the quiz again and follow the schema exactly.`,
          ),
        );
      }
    }
  };
}
