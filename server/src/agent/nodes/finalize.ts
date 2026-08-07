import { GraphNode } from "@langchain/langgraph";
import { QuizState } from "../state";
import { PrismaClient } from "../../generated/prisma/client";
import { InvalidStateError } from "../../common/errors";

export function makeFinalizeNode(
  prisma: PrismaClient,
): GraphNode<typeof QuizState> {
  return async (state, config) => {
    // TODO: make replay safe by checking if an attempt already exists for this thread_id and quiz_id, and if so, skip creating a new attempt.

    if (!state.quiz) {
      throw new InvalidStateError("Missing required state property: quiz");
    }

    if (!config.configurable?.thread_id) {
      throw new InvalidStateError(
        "Missing required config property: thread_id",
      );
    }

    if (
      !state.quiz.questions.every(
        (q) => state.answers[q.id] && state.scores[q.id] !== undefined,
      )
    ) {
      throw new InvalidStateError(
        "Answers or scores are missing or incomplete.",
      );
    }

    if (state.finalScore === undefined) {
      throw new InvalidStateError(
        "Missing required state property: finalScore",
      );
    }

    const created = await prisma.attempt.create({
      data: {
        quizId: state.quiz.id,
        threadId: config.configurable.thread_id as string,
        finalScore: state.finalScore,
        startedAt: new Date(), // FIXME: This should be the actual start time of the attempt, not now.
        answers: {
          create: state.quiz.questions.map((question) => ({
            questionId: question.id,
            score: state.scores[question.id],
            selections: {
              create: state.answers[question.id].map((optionId) => ({
                optionId,
              })),
            },
          })),
        },
      },
    });

    return {
      attemptId: created.id,
    };
  };
}
