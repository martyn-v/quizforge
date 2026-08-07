import { PrismaClient } from "../../generated/prisma/client";
import { PersistQuizError, InvalidStateError } from "../../common/errors";
import { QuizState } from "../state";
import type { GraphNode } from "@langchain/langgraph";

export function makePersistQuizNode(
  prisma: PrismaClient,
): GraphNode<typeof QuizState> {
  return async (state) => {
    if (state.quizId) {
      // The quiz is already persisted, so return the id unchanged. This
      // guard only helps when the checkpoint after this node was saved. A
      // crash between the create and that checkpoint writes a duplicate
      // quiz on replay. We accept that window in this demo.
      return { quizId: state.quizId };
    }

    if (!state.quiz) {
      throw new InvalidStateError("Missing required state property: quiz");
    }

    try {
      // TODO: fill missing fields
      const result = await prisma.quiz.create({
        data: {
          sourceUrl: state.readme_url,
          title: state.quiz.title,
          description: state.quiz.description,
          strategy: "todo",
          model: "todo",
          questions: {
            create: state.quiz.questions.map((q, qi) => ({
              position: qi,
              text: q.text,
              type: q.type === "single" ? "SINGLE" : "MULTI",
              options: {
                create: q.options.map((o, oi) => ({
                  position: oi,
                  text: o.text,
                  isCorrect: o.isCorrect,
                })),
              },
            })),
          },
        },
      });

      return { quizId: result.id };
    } catch (error) {
      throw new PersistQuizError(
        `Quiz could not be saved: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  };
}
