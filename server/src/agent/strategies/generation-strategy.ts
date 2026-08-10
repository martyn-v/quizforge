import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { DraftQuiz } from "@quizforge/shared";

/**
 * The available generation strategies. The `GENERATION_STRATEGY`
 * environment variable selects one of these values.
 * `generationStrategyProvider` rejects an unknown value at startup.
 */
export enum GenerationStrategy {
  /**
   * Makes one generation call for the pruned document (default)
   */
  SINGLE_PASS = "single-pass",
  /**
   * Divides the document by section, generates for each part, then removes duplicates and selects the target number
   */
  CHUNKED = "chunked",
}

/** What a strategy hands back to the generateQuestions node. */
export interface GenerationResult {
  draft: DraftQuiz;
  generationRetries: number;
}

/**
 * The contract a generation strategy implements. The model is a
 * parameter and not a constructor dependency, so the registry holds
 * plain stateless objects and a test passes a fake model directly.
 */
export interface QuizGenerationStrategy {
  readonly name: GenerationStrategy;
  generate(llm: BaseChatModel, source: string): Promise<GenerationResult>;
}
