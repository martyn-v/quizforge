import { describe, expect, it } from "vitest";
import { feedbackEntries, uploadScorecard } from "./langsmith-upload.ts";
import type { FixtureScore } from "./scorecard.ts";

const fullRow: FixtureScore = {
  fixtureId: "pipecat",
  structuralFailures: [],
  answerability: 1,
  singleDefensible: 0.75,
  distractorPlausibility: 0.5,
  coverage: 0.6,
  multiFraction: 0.4,
  retries: 1,
};

describe("feedbackEntries", () => {
  it("maps a full row to seven entries", () => {
    const entries = feedbackEntries(fullRow);
    expect(entries).toEqual([
      { key: "answerability", score: 1 },
      { key: "single_defensible", score: 0.75 },
      { key: "distractor_plausibility", score: 0.5 },
      { key: "coverage", score: 0.6 },
      { key: "multi_fraction", score: 0.4 },
      { key: "retries", score: 1 },
      { key: "structural", score: 1 },
    ]);
  });

  it("drops null metrics and keeps structural", () => {
    const failed: FixtureScore = {
      fixtureId: "left-pad",
      structuralFailures: ["generation failed: boom"],
      answerability: null,
      singleDefensible: null,
      distractorPlausibility: null,
      coverage: null,
      multiFraction: null,
      retries: null,
    };
    expect(feedbackEntries(failed)).toEqual([
      {
        key: "structural",
        score: 0,
        comment: "generation failed: boom",
      },
    ]);
  });

  it("joins several structural failures into one comment", () => {
    const entries = feedbackEntries({
      ...fullRow,
      structuralFailures: ["too few questions", "option count is not 4"],
    });
    expect(entries.at(-1)).toEqual({
      key: "structural",
      score: 0,
      comment: "too few questions; option count is not 4",
    });
  });

  it("keeps a zero retries entry", () => {
    const entries = feedbackEntries({ ...fullRow, retries: 0 });
    expect(entries).toContainEqual({ key: "retries", score: 0 });
  });
});

describe("uploadScorecard", () => {
  it("resolves without network when tracing is off", async () => {
    // vitest.setup.ts forces LANGSMITH_TRACING=false. The gate must
    // return before any client is built, so this resolves offline.
    await expect(
      uploadScorecard({
        fixtures: [],
        scores: [],
        generator: {},
        judge: {},
        comment: null,
        stamp: "2026-08-10T00-00-00.000Z",
      }),
    ).resolves.toBeUndefined();
  });
});
