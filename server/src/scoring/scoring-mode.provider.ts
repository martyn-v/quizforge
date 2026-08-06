import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
  type MultipleChoiceScoringStrategy,
} from "./scoring-modes.strategy";
import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const SCORING_MODE_PROVIDER = Symbol("SCORING_MODE_PROVIDER");

// `satisfies` rather than a type annotation, so the exact factory signature
// survives for callers. See generation-strategy.provider.ts for the reasons.
export const scoringModeProvider = {
  provide: SCORING_MODE_PROVIDER,
  useFactory: (config: ConfigService): MultipleChoiceScoringStrategy => {
    const mode = config.get<MultipleChoiceScoringMode>(
      "SCORING_MODE",
      MultipleChoiceScoringMode.SPEC,
    );
    const strategy = MULTIPLE_CHOICE_SCORING_STRATEGY[mode];
    // Fail here rather than hand back undefined: an unresolved strategy would
    // boot cleanly and then throw "is not a function" on the first question
    // scored, stranding a quiz that is already underway.
    if (!strategy) {
      throw new Error(
        `Unknown SCORING_MODE: ${mode}. Valid modes are ${Object.values(
          MultipleChoiceScoringMode,
        ).join(", ")}`,
      );
    }
    return strategy;
  },
  inject: [ConfigService],
} satisfies FactoryProvider<MultipleChoiceScoringStrategy>;
