import { SystemMessage, HumanMessage } from "@langchain/core/messages";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GeneratedQuizSchema } from "../agent.schemas";
import { invokeWithRepair } from "./invoke-with-repair";
import {
  GenerationStrategy,
  type GenerationResult,
  type QuizGenerationStrategy,
} from "./generation-strategy";

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
 * Makes one generation call for the whole pruned document, with one
 * repair round on a schema failure.
 */
export function makeSinglePassStrategy(
  maxAttempts = 2,
): QuizGenerationStrategy {
  return {
    name: GenerationStrategy.SINGLE_PASS,
    async generate(
      llm: BaseChatModel,
      source: string,
    ): Promise<GenerationResult> {
      const messages = [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(source),
      ];

      const { value, retries } = await invokeWithRepair(
        llm,
        GeneratedQuizSchema,
        messages,
        maxAttempts,
      );

      return { draft: value, generationRetries: retries };
    },
  };
}
