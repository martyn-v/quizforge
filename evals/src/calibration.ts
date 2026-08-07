import type { Negative } from "./negatives";
import type { QuestionVerdict } from "./judge";

export interface CalibrationResult {
  negative: Negative;
  verdict: QuestionVerdict;
}

/**
 * Returns one message per negative the judge let through. The judge must
 * set the expected verdict field to false for every planted bad question.
 */
export function calibrationFailures(results: CalibrationResult[]): string[] {
  return results
    .filter(({ negative, verdict }) => verdict[negative.mustFail])
    .map(
      ({ negative }) =>
        `judge passed a planted bad question (${negative.fixtureId}: ${negative.note})`,
    );
}
