import { CommandInstance } from "@langchain/langgraph";
import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
} from "../../scoring/scoring-modes";
import { ScoringService } from "../../scoring/scoring.service";
import { QuizState } from "../state";
import { makeQuiz, oid, qid } from "../quiz-fixtures";
import { makeScoreAnswersNode } from "./score-answers";

const QUIZ_ID = "412438f7-b949-41d0-aaae-6387d5bc9291";

// The fixture puts the correct options at varied positions: question 1
// has correct option index 2, question 2 has 1 and 3, question 3 has 0,
// question 4 has 0 and 1, question 5 has 3. Every answer here is correct.
const correctAnswers = {
  [qid(0)]: [oid(0, 2)],
  [qid(1)]: [oid(1, 1), oid(1, 3)],
  [qid(2)]: [oid(2, 0)],
  [qid(3)]: [oid(3, 0), oid(3, 1)],
  [qid(4)]: [oid(4, 3)],
};

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  draft: undefined,
  quiz: makeQuiz(QUIZ_ID),
  answers: correctAnswers,
  scores: {},
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
    expect(result.scores).toEqual({
      [qid(0)]: 4,
      [qid(1)]: 4,
      [qid(2)]: 4,
      [qid(3)]: 4,
      [qid(4)]: 4,
    });
    expect(result.finalScore).toEqual(4);
  });

  it("scores wrong answers as 0 and partial multi answers proportionally", async () => {
    // ARRANGE:
    const scoringService = new ScoringService(strategy);
    const stateWithMixedAnswers = {
      ...state,
      answers: {
        [qid(0)]: [oid(0, 1)], // wrong: correct is option 3
        [qid(1)]: [oid(1, 1)], // partial: 1 of the 2 correct options
        [qid(2)]: [oid(2, 0)], // correct
        [qid(3)]: [oid(3, 2), oid(3, 3)], // wrong: correct is options 1 and 2
        [qid(4)]: [oid(4, 3)], // correct
      },
    };

    // ACT:
    const result = await makeScoreAnswersNode(scoringService)(
      stateWithMixedAnswers,
      {} as never,
    );

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result.scores).toEqual({
      [qid(0)]: 0,
      [qid(1)]: 2,
      [qid(2)]: 4,
      [qid(3)]: 0,
      [qid(4)]: 4,
    });
    // Weighted average over the question order, weights 1.1^index:
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

  it("throws an InvalidStateError if an answer is missing", () => {
    const scoringService = new ScoringService(strategy);
    // Only 2 of the 5 questions have an answer.
    const invalidState = {
      ...state,
      answers: { [qid(0)]: [oid(0, 2)], [qid(1)]: [oid(1, 1), oid(1, 3)] },
    };

    expect(() =>
      makeScoreAnswersNode(scoringService)(invalidState, {} as never),
    ).toThrowError("Answers are missing or incomplete.");
  });
});
