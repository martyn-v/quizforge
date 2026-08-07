import { CommandInstance } from "@langchain/langgraph";
import { makePersistQuizNode } from "./persist-quiz";
import { QuizState } from "../state";
import { makePrismaMock } from "../../common/testing";
import { InvalidStateError, PersistQuizError } from "../../common/errors";
import { makeDbQuiz, makeDraft, makeQuiz } from "../quiz-fixtures";

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  draft: makeDraft(),
  quiz: undefined,
  answers: {},
  scores: {},
  finalScore: undefined,
  attemptId: undefined,
};

describe("persistQuizNode", () => {
  it("persists the draft and returns the quiz with database ids", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    prisma.quiz.create.mockResolvedValue(makeDbQuiz(quizId));

    // ACT:
    const result = await makePersistQuizNode(prisma)(state, {} as never);

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result).toEqual({ quiz: makeQuiz(quizId) });

    expect(prisma.quiz.create).toHaveBeenCalledWith({
      data: {
        sourceUrl:
          "https://raw.githubusercontent.com/owner/repo/main/README.md",
        title: "hello",
        description: "this is a quiz",
        strategy: "todo",
        model: "todo",
        questions: {
          create: makeDraft().questions.map((q, qi) => ({
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
      include: {
        questions: {
          orderBy: { position: "asc" },
          include: { options: { orderBy: { position: "asc" } } },
        },
      },
    });
  });

  it("is idempotent once the quiz is in state", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithQuiz = { ...state, quiz: makeQuiz(crypto.randomUUID()) };

    // ACT:
    const result = await makePersistQuizNode(prisma)(
      stateWithQuiz,
      {} as never,
    );

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result).toEqual({});
    expect(prisma.quiz.create).not.toHaveBeenCalled();
  });

  it("throws when the draft is not in the state", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithoutDraft = { ...state, draft: undefined };

    // ACT & ASSERT:
    await expect(
      makePersistQuizNode(prisma)(stateWithoutDraft, {} as never),
    ).rejects.toThrowError(InvalidStateError);
  });

  it("throws when there is an error persisting the quiz", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const dbError = new Error("Database error");
    prisma.quiz.create.mockRejectedValue(dbError);

    // ACT:
    const promise = makePersistQuizNode(prisma)(state, {} as never);

    // ASSERT: class, message, and preserved cause each checked on their own.
    // toThrowError(new PersistQuizError(...)) compares only the message.
    await expect(promise).rejects.toBeInstanceOf(PersistQuizError);
    await expect(promise).rejects.toMatchObject({
      message: "Quiz could not be saved: Database error",
      cause: dbError,
    });
  });
});
