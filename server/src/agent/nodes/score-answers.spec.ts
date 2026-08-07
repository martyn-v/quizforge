import { CommandInstance } from "@langchain/langgraph";
import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
} from "../../scoring/scoring-modes";
import { ScoringService } from "../../scoring/scoring.service";
import { QuizState } from "../state";
import { makeScoreAnswersNode } from "./score-answers";

// The correct options deliberately sit at varied positions, not first. A
// mapping that rebuilds option indices from a filtered array produces the
// same sets when every correct option leads its question, and this fixture
// is what catches that.
const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  quiz: {
    title: "hello",
    description: "this is a quiz",
    questions: [
      {
        text: "Question 1",
        type: "single",
        options: [
          { text: "Option 1", isCorrect: false },
          { text: "Option 2", isCorrect: false },
          { text: "Option 3", isCorrect: true },
          { text: "Option 4", isCorrect: false },
        ],
      },
      {
        text: "Question 2",
        type: "multi",
        options: [
          { text: "Option 1", isCorrect: false },
          { text: "Option 2", isCorrect: true },
          { text: "Option 3", isCorrect: false },
          { text: "Option 4", isCorrect: true },
        ],
      },
      {
        text: "Question 3",
        type: "single",
        options: [
          { text: "Option 1", isCorrect: true },
          { text: "Option 2", isCorrect: false },
          { text: "Option 3", isCorrect: false },
          { text: "Option 4", isCorrect: false },
        ],
      },
      {
        text: "Question 4",
        type: "multi",
        options: [
          { text: "Option 1", isCorrect: true },
          { text: "Option 2", isCorrect: true },
          { text: "Option 3", isCorrect: false },
          { text: "Option 4", isCorrect: false },
        ],
      },
      {
        text: "Question 5",
        type: "single",
        options: [
          { text: "Option 1", isCorrect: false },
          { text: "Option 2", isCorrect: false },
          { text: "Option 3", isCorrect: false },
          { text: "Option 4", isCorrect: true },
        ],
      },
    ],
  },
  quizId: "412438f7-b949-41d0-aaae-6387d5bc9291",
  answers: [[2], [1, 3], [0], [0, 1], [3]], // every answer is correct
  scores: [],
  finalScore: undefined,
};

describe("scoreAnswersNode", () => {
  const strategy =
    MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.SCALED]; // Scaled ensures that correct multi-choice answers are scored as 4, which is what we want for this test.

  it("scores answers correctly using the scoring service", async () => {
    // ARRANGE:
    const scoringService = new ScoringService(strategy);

    // ACT:
    const result = await makeScoreAnswersNode(scoringService)(
      state,
      {} as never,
    );

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result.scores).toEqual([4, 4, 4, 4, 4]);
    expect(result.finalScore).toEqual(4);
  });

  it("scores wrong answers as 0 and partial multi answers proportionally", async () => {
    // ARRANGE:
    const scoringService = new ScoringService(strategy);
    const stateWithMixedAnswers = {
      ...state,
      answers: [
        [1], // wrong: correct is 2
        [1], // partial: 1 of the 2 correct options
        [0], // correct
        [2, 3], // wrong: correct is 0 and 1
        [3], // correct
      ],
    };

    // ACT:
    const result = await makeScoreAnswersNode(scoringService)(
      stateWithMixedAnswers,
      {} as never,
    );

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result.scores).toEqual([0, 2, 4, 0, 4]);
    // Weighted average, weights 1.1^index:
    // (0 + 2*1.1 + 4*1.21 + 0 + 4*1.4641) / 6.1051
    expect(result.finalScore).toBeCloseTo(2.1124, 3);
  });

  it("throws an InvalidStateError if the quiz is missing", () => {
    const scoringService = new ScoringService(strategy);
    const invalidState = { ...state, quiz: undefined };

    expect(() =>
      makeScoreAnswersNode(scoringService)(invalidState, {} as never),
    ).toThrowError("Quiz data is missing.");
  });

  it("throws an InvalidStateError if the answers are missing or incomplete", () => {
    const scoringService = new ScoringService(strategy);
    const invalidState = { ...state, answers: [[0], [0, 1]] }; // Only 2 answers for 5 questions

    expect(() =>
      makeScoreAnswersNode(scoringService)(invalidState, {} as never),
    ).toThrowError("Answers are missing or incomplete.");
  });
});
