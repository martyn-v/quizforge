import { calibrationFailures } from "./calibration";
import { negatives } from "./negatives";
import type { QuestionVerdict } from "./judge";

function verdictWith(overrides: Partial<QuestionVerdict>): QuestionVerdict {
  return {
    answerable: true,
    singleDefensibleAnswer: true,
    distractorsPlausible: true,
    reasoning: "",
    ...overrides,
  };
}

describe("negatives", () => {
  it("has three negatives per fixture", () => {
    const counts = new Map<string, number>();
    for (const negative of negatives) {
      counts.set(negative.fixtureId, (counts.get(negative.fixtureId) ?? 0) + 1);
    }
    expect(counts.get("langgraphjs")).toBe(3);
    expect(counts.get("pipecat")).toBe(3);
    expect(counts.get("left-pad")).toBe(3);
  });
});

describe("calibrationFailures", () => {
  it("passes when the judge fails every negative on the expected field", () => {
    const results = negatives.map((negative) => ({
      negative,
      verdict: verdictWith({ [negative.mustFail]: false }),
    }));
    expect(calibrationFailures(results)).toEqual([]);
  });

  it("reports a negative the judge let through", () => {
    const results = negatives.map((negative) => ({
      negative,
      verdict: verdictWith({}),
    }));
    const failures = calibrationFailures(results);
    expect(failures).toHaveLength(negatives.length);
    expect(failures[0]).toContain(negatives[0].note);
  });
});
