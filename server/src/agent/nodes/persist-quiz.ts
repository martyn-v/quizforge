import type { GraphNode } from "@langchain/langgraph";
import type { Quiz } from "@quizforge/shared";
import { PrismaClient } from "../../generated/prisma/client";
import { PersistQuizError, InvalidStateError } from "../../common/errors";
import { QuizState } from "../state";
import { fromDbQuestionType, toDbQuestionType } from "../question-type-map";

export function makePersistQuizNode(
  prisma: PrismaClient,
): GraphNode<typeof QuizState> {
  return async (state) => {
    if (state.quiz) {
      // The quiz is already persisted, so leave the state unchanged.
      // This guard only helps when the checkpoint after this node was
      // saved. A crash between the create and that checkpoint writes a
      // duplicate quiz on replay. We accept that window in this demo.
      return {};
    }

    if (!state.draft) {
      throw new InvalidStateError("Missing required state property: draft");
    }

    try {
      // TODO: fill missing fields
      const created = await prisma.quiz.create({
        data: {
          sourceUrl: state.readme_url,
          title: state.draft.title,
          description: state.draft.description,
          strategy: "todo",
          model: "todo",
          questions: {
            create: state.draft.questions.map((q, qi) => ({
              position: qi,
              text: q.text,
              type: toDbQuestionType(q.type),
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
        // The read-back carries the database ids. The explicit orderBy
        // keeps the generation order; Prisma does not guarantee one.
        include: {
          questions: {
            orderBy: { position: "asc" },
            include: { options: { orderBy: { position: "asc" } } },
          },
        },
      });

      const quiz: Quiz = {
        id: created.id,
        title: created.title,
        description: created.description ?? undefined,
        questions: created.questions.map((q) => ({
          id: q.id,
          text: q.text,
          type: fromDbQuestionType(q.type),
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
          })),
        })),
      };

      return { quiz };
    } catch (error) {
      throw new PersistQuizError(
        `Quiz could not be saved: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  };
}
