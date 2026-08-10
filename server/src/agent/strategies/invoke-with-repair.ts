import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { OutputParserException } from "@langchain/core/output_parsers";
import { z } from "zod/v4";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GenerateQuestionsError } from "../../common/errors";

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

/**
 * Calls the model with structured output and one repair round per extra
 * attempt (AGENTS.md: one repair round, then fail loudly). A schema
 * failure goes back to the model as feedback; any other error raises
 * immediately. Both generation strategies share this loop.
 *
 * @returns The parsed value and the number of repair rounds it took.
 */
export async function invokeWithRepair<Schema extends z.ZodType>(
  llm: BaseChatModel,
  schema: Schema,
  messages: BaseMessage[],
  maxAttempts = 2,
): Promise<{ value: z.infer<Schema>; retries: number }> {
  const model = llm.withStructuredOutput(schema);

  for (let attempt = 1; ; attempt++) {
    try {
      const result = await model.invoke(messages);
      return { value: schema.parse(result), retries: attempt - 1 };
    } catch (error) {
      if (!isSchemaFailure(error)) {
        throw new GenerateQuestionsError(
          `Model call failed: ${describeFailure(error)}`,
          { cause: error },
        );
      }
      if (attempt >= maxAttempts) {
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
}
