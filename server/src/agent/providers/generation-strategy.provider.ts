import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GENERATION_STRATEGIES } from "../strategies/registry";
import {
  GenerationStrategy,
  type QuizGenerationStrategy,
} from "../strategies/generation-strategy";

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
  useFactory: (config: ConfigService): QuizGenerationStrategy => {
    const name = config.get<string>(
      "GENERATION_STRATEGY",
      GenerationStrategy.SINGLE_PASS.toString(),
    );

    const strategy = GENERATION_STRATEGIES[name as GenerationStrategy];
    // Fail here rather than hand back undefined: an unresolved strategy
    // would boot cleanly and then throw on the first generation call.
    if (!strategy) {
      throw new Error(
        `Unknown GENERATION_STRATEGY: ${name}. Valid strategies are ${Object.values(
          GenerationStrategy,
        ).join(", ")}`,
      );
    }
    return strategy;
  },
  inject: [ConfigService],
} satisfies FactoryProvider<QuizGenerationStrategy>;
