import { InvalidAnswerError } from "../common/errors";
import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
} from "./scoring-modes.strategy";
import { ScoringService } from "./scoring.service";
import { ScorableQuestion } from "./scoring.types";

describe("ScoringService", () => {
  const strategy =
    MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.SPEC];

  it("should be defined", () => {
    const service = new ScoringService(strategy);
    expect(service).toBeDefined();
  });

  describe("scoreQuestion", () => {
    it("should return a score of 4 for a correct answer to a SINGLE choice question", () => {
      const service = new ScoringService(strategy);
      const scoreQuestion: ScorableQuestion = {
        type: "SINGLE",
        correctOptionIds: new Set(["option1"]),
        allOptionIds: new Set(["option1", "option2", "option3"]),
      };

      const answerOptionIds = new Set(["option1"]);

      const scoredAnswer = service.scoreQuestion(
        scoreQuestion,
        answerOptionIds,
      );
      expect(scoredAnswer.score).toBe(4);
    });

    it("should return a score of 0 for an incorrect answer to a SINGLE choice question", () => {
      const service = new ScoringService(strategy);
      const scoreQuestion: ScorableQuestion = {
        type: "SINGLE",
        correctOptionIds: new Set(["option1"]),
        allOptionIds: new Set(["option1", "option2", "option3"]),
      };

      const answerOptionIds = new Set(["option2"]);

      const scoredAnswer = service.scoreQuestion(
        scoreQuestion,
        answerOptionIds,
      );
      expect(scoredAnswer.score).toBe(0);
    });

    it.each([
      { mode: MultipleChoiceScoringMode.SPEC, expectedScore: 2 },
      { mode: MultipleChoiceScoringMode.SCALED, expectedScore: 4 },
      // 2 hits minus 1 miss is 1 of a possible 2, rebased onto 0..4.
      { mode: MultipleChoiceScoringMode.PENALIZED, expectedScore: 2 },
    ])(
      "should score the number of correct answers for a MULTI choice question using $mode strategy",
      ({ mode, expectedScore }) => {
        const service = new ScoringService(
          MULTIPLE_CHOICE_SCORING_STRATEGY[mode],
        );
        const scoreQuestion: ScorableQuestion = {
          type: "MULTI",
          correctOptionIds: new Set(["option1", "option2"]),
          allOptionIds: new Set(["option1", "option2", "option3", "option4"]),
        };

        const answerOptionIds = new Set(["option1", "option2", "option3"]);

        const scoredAnswer = service.scoreQuestion(
          scoreQuestion,
          answerOptionIds,
        );
        expect(scoredAnswer.score).toBe(expectedScore);
      },
    );

    // A flawless answer has to be worth the same on every question, or
    // finalScore averages incomparable numbers and a perfect quiz lands
    // below 4. SPEC is exempt: scoring the raw count is the rule the task
    // specifies, and its uneven ceiling is a property of that rule.
    describe.each([
      MultipleChoiceScoringMode.SCALED,
      MultipleChoiceScoringMode.PENALIZED,
    ])("%s strategy", (mode) => {
      it.each([
        { label: "one correct option", correct: ["option1"] },
        { label: "three correct options", correct: ["a", "b", "c"] },
      ])("awards full marks for a perfect answer, $label", ({ correct }) => {
        const service = new ScoringService(
          MULTIPLE_CHOICE_SCORING_STRATEGY[mode],
        );
        const question: ScorableQuestion = {
          type: "MULTI",
          correctOptionIds: new Set(correct),
          allOptionIds: new Set([...correct, "distractor"]),
        };

        expect(service.scoreQuestion(question, new Set(correct)).score).toBe(4);
      });
    });
  });

  describe("finalScore", () => {
    it("should calculate the final score based on the scored answers", () => {
      const service = new ScoringService(strategy);
      const scoredAnswers = [{ score: 4 }, { score: 2 }, { score: 4 }];

      const finalScore = service.finalScore(scoredAnswers);
      expect(finalScore).toBeCloseTo(3.34, 1);
    });
  });

  // An invalid answer must never be scored. It has to surface as a throw the
  // askQuestion node can catch and turn into a re-prompt, because a silent
  // score is unrecoverable: the quiz moves on with a wrong number.
  describe("invalid answers", () => {
    const single: ScorableQuestion = {
      type: "SINGLE",
      correctOptionIds: new Set(["option1"]),
      allOptionIds: new Set(["option1", "option2", "option3"]),
    };

    const multiple: ScorableQuestion = {
      type: "MULTI",
      correctOptionIds: new Set(["option1", "option2"]),
      allOptionIds: new Set(["option1", "option2", "option3", "option4"]),
    };

    describe("cardinality", () => {
      // Both orderings matter. Reading only the first element of the set makes
      // the result depend on insertion order: {option1,option2} scores 4 and
      // {option2,option1} scores 0 for the same selection.
      it.each([
        { order: "correct first", selected: ["option1", "option2"] },
        { order: "correct second", selected: ["option2", "option1"] },
      ])(
        "rejects two selections on a SINGLE question, $order",
        ({ selected }) => {
          const service = new ScoringService(strategy);

          expect(() =>
            service.scoreQuestion(single, new Set(selected)),
          ).toThrow(InvalidAnswerError);
        },
      );

      it("rejects an empty selection on a SINGLE question", () => {
        const service = new ScoringService(strategy);

        expect(() => service.scoreQuestion(single, new Set())).toThrow(
          InvalidAnswerError,
        );
      });

      it("rejects an empty selection on a MULTI question", () => {
        const service = new ScoringService(strategy);

        expect(() => service.scoreQuestion(multiple, new Set())).toThrow(
          InvalidAnswerError,
        );
      });
    });

    describe("membership", () => {
      it("rejects an option that belongs to no question on the quiz", () => {
        const service = new ScoringService(strategy);

        expect(() =>
          service.scoreQuestion(single, new Set(["not-an-option"])),
        ).toThrow(InvalidAnswerError);
      });

      it("rejects a foreign option mixed in with valid ones", () => {
        const service = new ScoringService(strategy);

        expect(() =>
          service.scoreQuestion(
            multiple,
            new Set(["option1", "another-questions-option"]),
          ),
        ).toThrow(InvalidAnswerError);
      });

      it("still scores a valid option that happens to be wrong", () => {
        const service = new ScoringService(strategy);

        // option3 is in allOptionIds but not correct: wrong, not invalid.
        expect(
          service.scoreQuestion(multiple, new Set(["option1", "option3"]))
            .score,
        ).toBe(1);
      });
    });

    it("throws with a reason the re-prompt can show the user", () => {
      const service = new ScoringService(strategy);

      // /\S/ only asserts the message is not empty, leaving the wording open.
      expect(() =>
        service.scoreQuestion(single, new Set(["option1", "option2"])),
      ).toThrow(/\S/);
    });
  });
});
