import type { GraphNode } from "@langchain/langgraph";
import type { Quiz } from "@quizforge/shared";
import { PrismaClient } from "../../generated/prisma/client";
import { PersistQuizError, InvalidStateError } from "../../common/errors";
import { QuizState } from "../state";
import { fromDbQuestionType, toDbQuestionType } from "../question-type-map";

/**
 * Creates a graph node that persists the quiz to the database using Prisma.
 *
 * We persist the quiz based on the draft and return the object of the quiz including the database ids so we have stable identifiers for the rest of the graph.
 * The node returns a partial state with the quiz and the startedAt timestamp.
 *
 * If the quiz is already persisted, it leaves the state unchanged.
 * If the draft is missing, it throws an InvalidStateError.
 * If the persistence fails, it throws a PersistQuizError.
 *
 * @param prisma - The Prisma client used to interact with the database.
 * @param quizMeta - Metadata about the quiz, including the model and strategy used for generation.
 * @returns A graph node that persists the quiz to the database.
 * @throws InvalidStateError if the draft is missing from the state.
 */
export function makePersistQuizNode(
  prisma: PrismaClient,
  quizMeta: { model: string; strategy: string },
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
      const created = await prisma.quiz.create({
        data: {
          sourceUrl: state.readme_url,
          title: state.draft.title,
          description: state.draft.description,
          strategy: quizMeta.strategy,
          model: quizMeta.model,
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

      return { quiz, startedAt: new Date().toISOString() };
    } catch (error) {
      throw new PersistQuizError(
        `Quiz could not be saved: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  };
}
