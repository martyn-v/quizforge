import { Inject, Injectable } from "@nestjs/common";
import { ScorableQuestion, ScoredAnswer } from "./scoring.types";
import { SCORING_MODE_PROVIDER } from "./scoring-mode.provider";
import type { MultipleChoiceScoringStrategy } from "./scoring-modes.strategy";
import { InvalidAnswerError } from "../common/errors";

@Injectable()
export class ScoringService {
  constructor(
    @Inject(SCORING_MODE_PROVIDER)
    private readonly scoringMode: MultipleChoiceScoringStrategy,
  ) {}

  /**
   * Validates the answer for a given question. Throws an error if the answer is invalid.
   *
   * @throws {InvalidAnswerError} If the answer is invalid for the given question.
   * @param question The question to validate against.
   * @param answerOptionIds The set of answer option IDs to validate.
   */
  private validateAnswer(
    question: ScorableQuestion,
    answerOptionIds: ReadonlySet<string>,
  ) {
    if (question.type === "SINGLE") {
      if (answerOptionIds.size !== 1) {
        throw new InvalidAnswerError(
          "SINGLE choice question must have exactly one answer",
        );
      }

      if (!question.allOptionIds.has(Array.from(answerOptionIds)[0])) {
        throw new InvalidAnswerError(
          `Answer option ${Array.from(answerOptionIds)[0]} is not a valid option for this question`,
        );
      }
    }

    if (question.type === "MULTI") {
      if (answerOptionIds.size < 1) {
        throw new InvalidAnswerError(
          "MULTI choice question must have at least one answer",
        );
      }

      for (const answerOptionId of answerOptionIds) {
        if (!question.allOptionIds.has(answerOptionId)) {
          throw new InvalidAnswerError(
            `Answer option ${answerOptionId} is not a valid option for this question`,
          );
        }
      }
    }
  }

  scoreQuestion(
    question: ScorableQuestion,
    answerOptionIds: ReadonlySet<string>,
  ): ScoredAnswer {
    this.validateAnswer(question, answerOptionIds);

    if (question.type === "SINGLE") {
      const isCorrect = question.correctOptionIds.has(
        Array.from(answerOptionIds)[0],
      );
      return { score: isCorrect ? 4 : 0 };
    } else {
      const hits = Array.from(answerOptionIds).filter((id) =>
        question.correctOptionIds.has(id),
      ).length;
      const misses = Array.from(answerOptionIds).filter(
        (id) => !question.correctOptionIds.has(id),
      ).length;
      const totalCorrect = question.correctOptionIds.size;
      return { score: this.scoringMode(hits, misses, totalCorrect) };
    }
  }

  /**
   * Calculated the final score based on the scored answers.
   *
   * Uses weighted average with geometric weights, with weight 1.1^(n-1) (so 1.0, 1.1, 1.21, 1.331…)
   */
  finalScore(scoredAnswers: ScoredAnswer[]): number {
    let totalScore = 0;
    let totalWeight = 0;
    scoredAnswers.forEach((scoredAnswer, index) => {
      const weight = Math.pow(1.1, index);
      totalScore += scoredAnswer.score * weight;
      totalWeight += weight;
    });
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }
}
