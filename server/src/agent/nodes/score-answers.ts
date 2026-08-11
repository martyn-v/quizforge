import { GraphNode } from "@langchain/langgraph";
import type { Scores } from "@quizforge/shared";
import { QuizState } from "../state";
import { ScoringService } from "../../scoring/scoring.service";
import type { ScorableQuestion } from "../../scoring/scoring.types";
import { InvalidStateError } from "../../common/errors";

/**
 * Creates a graph node that scores the user's answers to the quiz questions.
 *
 * The node uses the provided ScoringService to score each question based on the user's selections.
 * It calculates the final score and returns a partial state with the scores and final score.
 *
 * @param scoringService - The ScoringService used to score the user's answers.
 * @returns A graph node that scores the user's answers to the quiz questions.
 * @throws InvalidStateError if the quiz state or answers are missing or incomplete.
 */
export function makeScoreAnswersNode(
  scoringService: ScoringService,
): GraphNode<typeof QuizState> {
  return (state) => {
    if (!state.quiz) {
      throw new InvalidStateError("Quiz data is missing.");
    }

    // Answers join to questions by id, never by position. Only the
    // weight order below comes from the question order.
    if (!state.quiz.questions.every((q) => state.answers[q.id])) {
      throw new InvalidStateError("Answers are missing or incomplete.");
    }

    const scores: Scores = {};
    const weighted: { score: number }[] = [];
    for (const question of state.quiz.questions) {
      const scorableQuestion: ScorableQuestion = {
        type: question.type,
        correctOptionIds: new Set(
          question.options.flatMap((o) => (o.isCorrect ? [o.id] : [])),
        ),
        allOptionIds: new Set(question.options.map((o) => o.id)),
      };

      const scoredAnswer = scoringService.scoreQuestion(
        scorableQuestion,
        new Set(state.answers[question.id]),
      );
      scores[question.id] = scoredAnswer.score;
      weighted.push({ score: scoredAnswer.score });
    }

    const finalScore = scoringService.finalScore(weighted);

    return { scores, finalScore };
  };
}
