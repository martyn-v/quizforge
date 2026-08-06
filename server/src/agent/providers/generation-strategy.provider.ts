import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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

export const GENERATION_STRATEGY_PROVIDER = Symbol(
  "GENERATION_STRATEGY_PROVIDER",
);

// Uses `satisfies` and not a type annotation. `Provider` is a union of every
// provider shape, so `useFactory` is not resolvable on it. `FactoryProvider`
// declares `useFactory` as `T | Promise<T>`, which makes this synchronous
// factory look asynchronous to a caller. `satisfies` checks the shape and
// keeps the exact inferred signature, so the spec can call the factory.
export const generationStrategyProvider = {
  provide: GENERATION_STRATEGY_PROVIDER,
  useFactory: (config: ConfigService): GenerationStrategy => {
    const strategy = config.get<string>(
      "GENERATION_STRATEGY",
      GenerationStrategy.SINGLE_PASS.toString(),
    );

    if (
      !Object.values(GenerationStrategy).includes(
        strategy as GenerationStrategy,
      )
    ) {
      throw new Error(
        `Unknown GENERATION_STRATEGY: ${strategy}. Valid strategies are ${Object.values(
          GenerationStrategy,
        ).join(", ")}`,
      );
    }
    return strategy as GenerationStrategy;
  },
  inject: [ConfigService],
} satisfies FactoryProvider<GenerationStrategy>;
