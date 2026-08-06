import type { ConfigService } from "@nestjs/config";
import { scoringModeProvider } from "./scoring-mode.provider";
import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
} from "./scoring-modes.strategy";

/** Minimal stand-in: the factory only ever calls get(key, defaultValue). */
function configWith(value?: string): ConfigService {
  return {
    get: (_key: string, defaultValue: unknown) => value ?? defaultValue,
  } as unknown as ConfigService;
}

describe("scoringModeProvider", () => {
  it("defaults to the spec strategy when SCORING_MODE is unset", () => {
    expect(scoringModeProvider.useFactory(configWith())).toBe(
      MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.SPEC],
    );
  });

  it.each(Object.values(MultipleChoiceScoringMode))(
    "resolves the %s strategy",
    (mode) => {
      expect(scoringModeProvider.useFactory(configWith(mode))).toBe(
        MULTIPLE_CHOICE_SCORING_STRATEGY[mode],
      );
    },
  );

  // Without this the factory hands back undefined and the app boots fine.
  // The failure then lands on the first question scored, mid-quiz, as
  // "this.scoringMode is not a function". A bad config value should stop
  // the process at startup instead.
  it("throws at startup for an unknown SCORING_MODE", () => {
    expect(() => scoringModeProvider.useFactory(configWith("bogus"))).toThrow(
      /bogus/,
    );
  });

  it("names the valid modes in the error, so the fix is obvious", () => {
    expect(() => scoringModeProvider.useFactory(configWith("bogus"))).toThrow(
      /spec.*scaled.*penalized/,
    );
  });
});
