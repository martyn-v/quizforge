import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
} from "./scoring-modes";

const spec = MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.SPEC];
const scaled =
  MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.SCALED];
const penalized =
  MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.PENALIZED];

describe("multi-answer scoring strategies", () => {
  // These cases are the comparison table in the file header. The table is the
  // evidence for the choice of scoring mode, so a change to a formula must
  // fail here and not only in the documentation.
  describe("the documented comparison table", () => {
    // A question with 4 options. The correct options are A and B.
    const totalCorrect = 2;

    it.each([
      { selection: "A, B (perfect)", hits: 2, misses: 0, expected: 2 },
      { selection: "A, B, C", hits: 2, misses: 1, expected: 2 },
      { selection: "A only", hits: 1, misses: 0, expected: 1 },
      { selection: "A, B, C, D", hits: 2, misses: 2, expected: 2 },
      { selection: "C, D", hits: 0, misses: 2, expected: 0 },
    ])("spec scores $selection as $expected", ({ hits, misses, expected }) => {
      expect(spec(hits, misses, totalCorrect)).toBe(expected);
    });

    it.each([
      { selection: "A, B (perfect)", hits: 2, misses: 0, expected: 4 },
      { selection: "A, B, C", hits: 2, misses: 1, expected: 4 },
      { selection: "A only", hits: 1, misses: 0, expected: 2 },
      { selection: "A, B, C, D", hits: 2, misses: 2, expected: 4 },
      { selection: "C, D", hits: 0, misses: 2, expected: 0 },
    ])(
      "scaled scores $selection as $expected",
      ({ hits, misses, expected }) => {
        expect(scaled(hits, misses, totalCorrect)).toBe(expected);
      },
    );

    it.each([
      { selection: "A, B (perfect)", hits: 2, misses: 0, expected: 4 },
      { selection: "A, B, C", hits: 2, misses: 1, expected: 2 },
      { selection: "A only", hits: 1, misses: 0, expected: 2 },
      { selection: "A, B, C, D", hits: 2, misses: 2, expected: 0 },
      { selection: "C, D", hits: 0, misses: 2, expected: 0 },
    ])(
      "penalized scores $selection as $expected",
      ({ hits, misses, expected }) => {
        expect(penalized(hits, misses, totalCorrect)).toBe(expected);
      },
    );
  });

  describe("wrong selections", () => {
    it("do not change the spec score", () => {
      expect(spec(2, 0, 2)).toBe(spec(2, 2, 2));
    });

    it("do not change the scaled score", () => {
      expect(scaled(2, 0, 2)).toBe(scaled(2, 2, 2));
    });

    it("reduce the penalized score", () => {
      expect(penalized(2, 2, 2)).toBeLessThan(penalized(2, 0, 2));
    });
  });

  describe("the maximum score", () => {
    // A correct answer must have the same value on every question. If it does
    // not, finalScore calculates the average of scores that are not
    // comparable. Spec is the exception, because the specification defines it.
    it.each([1, 2, 3, 4])(
      "scaled gives 4 for a correct answer to a question with %i correct options",
      (totalCorrect) => {
        expect(scaled(totalCorrect, 0, totalCorrect)).toBe(4);
      },
    );

    it.each([1, 2, 3, 4])(
      "penalized gives 4 for a correct answer to a question with %i correct options",
      (totalCorrect) => {
        expect(penalized(totalCorrect, 0, totalCorrect)).toBe(4);
      },
    );

    it.each([1, 2, 3, 4])(
      "spec gives the count, not 4, for a question with %i correct options",
      (totalCorrect) => {
        expect(spec(totalCorrect, 0, totalCorrect)).toBe(totalCorrect);
      },
    );
  });

  describe("the penalized minimum", () => {
    // finalScore calculates a weighted average of the question scores. A
    // negative score would reduce the score of the other questions.
    it.each([
      { hits: 0, misses: 1 },
      { hits: 1, misses: 3 },
      { hits: 0, misses: 4 },
    ])("is 0 when hits is $hits and misses is $misses", ({ hits, misses }) => {
      expect(penalized(hits, misses, 2)).toBe(0);
    });
  });

  describe("every strategy", () => {
    // Each question has 4 options. The counts below are therefore every
    // combination the application can produce.
    const cases: { hits: number; misses: number; totalCorrect: number }[] = [];
    for (let totalCorrect = 1; totalCorrect <= 4; totalCorrect++) {
      for (let hits = 0; hits <= totalCorrect; hits++) {
        for (let misses = 0; misses <= 4 - totalCorrect; misses++) {
          cases.push({ hits, misses, totalCorrect });
        }
      }
    }

    it.each(Object.values(MultipleChoiceScoringMode))(
      "%s returns a score between 0 and 4",
      (mode) => {
        const strategy = MULTIPLE_CHOICE_SCORING_STRATEGY[mode];

        for (const { hits, misses, totalCorrect } of cases) {
          const score = strategy(hits, misses, totalCorrect);

          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(4);
        }
      },
    );

    it("has an entry in the registry", () => {
      for (const mode of Object.values(MultipleChoiceScoringMode)) {
        expect(typeof MULTIPLE_CHOICE_SCORING_STRATEGY[mode]).toBe("function");
      }
    });
  });
});
