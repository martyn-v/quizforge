import type { GraphNode } from "@langchain/langgraph";
import { PrismaClient } from "../../generated/prisma/client";
import { LoadQuizError } from "../../common/errors";
import { QuizState } from "../state";
import { toQuiz } from "../db-quiz";

/**
 * Creates a graph node that loads a stored quiz for the source url.
 *
 * The node reads the newest quiz row that matches the normalized source
 * url in the state. When a row exists, the node returns the quiz and the
 * attempt start time, and the graph skips generation. When no row
 * exists, the node returns an empty update and the graph generates a
 * new quiz.
 *
 * The node does not compare the stored quiz with the current source.
 * That check is a planned future step.
 *
 * @param prisma - The Prisma client used to read the quiz.
 * @returns A graph node that loads the stored quiz.
 * @throws LoadQuizError when the database read fails.
 */
export function makeLoadQuizNode(
  prisma: PrismaClient,
): GraphNode<typeof QuizState> {
  return async (state) => {
    if (state.quiz) {
      // A replay after the checkpoint already carries the quiz.
      return {};
    }

    try {
      const row = await prisma.quiz.findFirst({
        where: { sourceUrl: state.readme_url },
        orderBy: { createdAt: "desc" },
        include: {
          questions: {
            orderBy: { position: "asc" },
            include: { options: { orderBy: { position: "asc" } } },
          },
        },
      });

      if (!row) {
        return {};
      }

      return { quiz: toQuiz(row), startedAt: new Date().toISOString() };
    } catch (error) {
      throw new LoadQuizError(
        `Quiz lookup failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  };
}
