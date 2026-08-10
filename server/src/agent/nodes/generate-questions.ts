import { GraphNode } from "@langchain/langgraph";
import { QuizState } from "../state";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GENERATION_STRATEGIES } from "../strategies/registry";
import {
  GenerationStrategy,
  type QuizGenerationStrategy,
} from "../strategies/generation-strategy";

/**
 * Adapts a generation strategy to a graph node. The strategy does the
 * work; the node only maps graph state to the strategy call. The
 * strategies live in ../strategies, behind the registry that
 * generationStrategyProvider selects from.
 */
export function makeGenerateQuestionsNode(
  llm: BaseChatModel,
  strategy: QuizGenerationStrategy = GENERATION_STRATEGIES[
    GenerationStrategy.SINGLE_PASS
  ],
): GraphNode<typeof QuizState> {
  return async (state) => strategy.generate(llm, state.source);
}
