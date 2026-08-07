import { aggregateScore, formatScorecard } from "./scorecard.ts";
import type { EvalQuiz } from "./quiz-shape.ts";
import type { QuestionVerdict, CoverageVerdict } from "./judge/judge.ts";

const quiz: EvalQuiz = {
  title: "t",
  questions: [
    {
      text: "q1",
      type: "single",
      options: [
        { text: "a", isCorrect: true },
        { text: "b", isCorrect: false },
        { text: "c", isCorrect: false },
        { text: "d", isCorrect: false },
      ],
    },
    {
      text: "q2",
      type: "multi",
      options: [
        { text: "a", isCorrect: true },
        { text: "b", isCorrect: true },
        { text: "c", isCorrect: false },
        { text: "d", isCorrect: false },
      ],
    },
  ],
};

function verdict(overrides: Partial<QuestionVerdict>): QuestionVerdict {
  return {
    answerable: true,
    singleDefensibleAnswer: true,
    distractorsPlausible: true,
    reasoning: "",
    ...overrides,
  };
}

describe("aggregateScore", () => {
  it("computes fractions per criterion", () => {
    const verdicts = [
      verdict({ answerable: false }),
      verdict({ distractorsPlausible: false }),
    ];
    const coverage: CoverageVerdict = {
      keyTopics: ["a", "b", "c", "d"],
      coveredTopics: ["a", "b", "x"],
    };

    const score = aggregateScore("left-pad", quiz, verdicts, coverage);

    expect(score.answerability).toBe(0.5);
    expect(score.distractorPlausibility).toBe(0.5);
    // singleDefensible counts single-answer questions only: q1 of q1.
    expect(score.singleDefensible).toBe(1);
    // "x" is not a key topic, so it does not count.
    expect(score.coverage).toBe(0.5);
  });

  it("returns null scores when there are no verdicts", () => {
    const score = aggregateScore("left-pad", quiz, [], null);
    expect(score.answerability).toBeNull();
    expect(score.coverage).toBeNull();
  });
});

describe("formatScorecard", () => {
  it("renders one row per fixture with percentages", () => {
    const score = aggregateScore("left-pad", quiz, [verdict({})], {
      keyTopics: ["a", "b"],
      coveredTopics: ["a"],
    });
    const table = formatScorecard([score]);
    expect(table).toContain("left-pad");
    expect(table).toContain("100%");
    expect(table).toContain("50%");
  });
});
