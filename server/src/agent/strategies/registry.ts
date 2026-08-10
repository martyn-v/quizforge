import { makeChunkedStrategy } from "./chunked.strategy";
import { makeSinglePassStrategy } from "./single-pass.strategy";
import {
  GenerationStrategy,
  type QuizGenerationStrategy,
} from "./generation-strategy";

/**
 * The strategies that `generationStrategyProvider` selects from.
 *
 * The record uses the full enum as its key. If you add a value to
 * `GenerationStrategy` and you do not add an implementation, the
 * compiler gives an error. The application does not start with a
 * missing strategy.
 */
export const GENERATION_STRATEGIES: Record<
  GenerationStrategy,
  QuizGenerationStrategy
> = {
  [GenerationStrategy.SINGLE_PASS]: makeSinglePassStrategy(),
  [GenerationStrategy.CHUNKED]: makeChunkedStrategy(),
};
