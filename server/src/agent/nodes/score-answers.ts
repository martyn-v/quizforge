import { GraphNode } from "@langchain/langgraph";
import { QuizState } from "../state";
import { ScoringService } from "../../scoring/scoring.service";
import type { ScorableQuestion } from "../../scoring/scoring.types";
import { InvalidStateError } from "../../common/errors";

export function makeScoreAnswersNode(
  scoringService: ScoringService,
): GraphNode<typeof QuizState> {
  return (state) => {
    if (!state.quiz) {
      throw new InvalidStateError("Quiz data is missing.");
    }

    if (state.answers?.length !== state.quiz.questions.length) {
      throw new InvalidStateError("Answers are missing or incomplete.");
    }

    const scores: number[] = [];
    for (let i = 0; i < state.quiz.questions.length; i++) {
      const question = state.quiz.questions[i];
      const answerOptionIds = new Set(state.answers[i]);

      const scorableQuestion: ScorableQuestion = {
        type: question.type.toUpperCase() as "SINGLE" | "MULTI",
        correctOptionIds: new Set(
          question.options.flatMap((o, i) => (o.isCorrect ? [i] : [])),
        ),
        allOptionIds: new Set(question.options.map((_, index) => index)),
      };

      const scoredAnswer = scoringService.scoreQuestion(
        scorableQuestion,
        answerOptionIds,
      );
      scores.push(scoredAnswer.score);
    }

    const finalScore = scoringService.finalScore(
      scores.map((score) => ({ score })),
    );

    return { scores, finalScore };
  };
}
