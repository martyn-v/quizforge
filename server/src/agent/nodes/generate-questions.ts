import { GraphNode } from "@langchain/langgraph";
import { QuizState } from "../state";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GENERATION_STRATEGIES } from "../strategies/registry";
import {
  GenerationStrategy,
  type QuizGenerationStrategy,
} from "../strategies/generation-strategy";

/**
 * Creates a graph node that generates quiz questions based on the source material using the provided LLM and generation strategy.
 *
 * The node uses the specified generation strategy to generate questions from the source material in the state.
 * It returns a partial state with the generated draft of questions.
 *
 * @param llm - The language model used for generating questions.
 * @param strategy - The generation strategy to use for generating questions. Defaults to the SINGLE_PASS strategy.
 * @returns A graph node that generates quiz questions.
 * @throws InvalidStateError if the source material is missing from the state.
 */
export function makeGenerateQuestionsNode(
  llm: BaseChatModel,
  strategy: QuizGenerationStrategy = GENERATION_STRATEGIES[
    GenerationStrategy.SINGLE_PASS
  ],
): GraphNode<typeof QuizState> {
  return async (state) => strategy.generate(llm, state.source);
}
