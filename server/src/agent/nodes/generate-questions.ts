import { GraphNode } from "@langchain/langgraph";
import { QuizState } from "../state";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { OutputParserException } from "@langchain/core/output_parsers";
import { z } from "zod/v4";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { QuizSchema } from "../agent.schemas";
import { GenerateQuestionsError } from "../../common/errors";

const SYSTEM_PROMPT = `
You are a helpful assistant that generates questions for a quiz based on the source material provided.
The source material is in Markdown format.
Generate questions that are clear, concise, and relevant to the content of the source material.
`;

/** True when the model answered but the output does not match the schema. */
function isSchemaFailure(error: unknown): boolean {
  return (
    error instanceof z.ZodError ||
    error instanceof OutputParserException ||
    error instanceof SyntaxError
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
    const model = llm.withStructuredOutput(QuizSchema);

    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(state.source),
    ];

    for (let attempt = 1; ; attempt++) {
      try {
        const result = await model.invoke(messages);
        return { quiz: QuizSchema.parse(result) };
      } catch (error) {
        if (!isSchemaFailure(error)) {
          throw new GenerateQuestionsError(
            `Model call failed: ${describeFailure(error)}`,
            { cause: error },
          );
        }
        if (attempt >= max_attempts) {
          throw new GenerateQuestionsError(
            `Output did not match the schema after ${attempt} attempts: ${describeFailure(error)}`,
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
