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
You are a quiz generator that generates questions for a quiz based on the source material provided.
The source material is in Markdown format.
Generate questions that are clear, concise, and relevant to the content of the source material.

Rules:
- Generate 5 to 8 questions.
- Each question must have exactly 4 options.
- The 4 options of a question must be distinct.
- Each question must be either a single-choice question (type "single") or a multiple-choice question (type "multi").
- The quiz must have a mix of single-choice and multiple-choice questions.
- Single-choice questions must have exactly 1 correct option.
- Multiple-choice questions must have 2 or 3 correct options.
- Multiple-choice questions must not leak the number of correct options in the question text.
- Ask about the content of the source material, not about the document itself or its formatting.
- Options marked as correct must be the only defensible answers based on the source material.
- Incorrect options must be plausible to a reader who has not read the source material closely.
- Do not use options such as "All of the above" or "None of the above".
- The questions and options must be grammatically correct and free of spelling errors.
- The questions and options must be in English.
- Randomize the correct option(s) and the order of the options for each question.
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
