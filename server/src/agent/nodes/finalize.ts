import { GraphNode } from "@langchain/langgraph";
import { QuizState } from "../state";
import { PrismaClient } from "../../generated/prisma/client";
import { InvalidStateError } from "../../common/errors";

/**
 * Creates a graph node that finalizes the quiz attempt by persisting the attempt and answers to the database using Prisma.
 *
 * The node checks for the required state properties and config properties, and then creates a new attempt in the database with the final score and answers.
 * It returns a partial state with the attempt ID.
 *
 * @param prisma - The Prisma client used to interact with the database.
 *
 * @returns A graph node that finalizes the quiz attempt.
 * @throws InvalidStateError if any required state or config properties are missing or incomplete.
 */
export function makeFinalizeNode(
  prisma: PrismaClient,
): GraphNode<typeof QuizState> {
  return async (state, config) => {
    // TODO: make replay safe by checking if an attempt already exists for this thread_id and quiz_id, and if so, skip creating a new attempt.

    if (!state.quiz) {
      throw new InvalidStateError("Missing required state property: quiz");
    }

    if (!state.startedAt) {
      throw new InvalidStateError("Missing required state property: startedAt");
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
        startedAt: state.startedAt,
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
