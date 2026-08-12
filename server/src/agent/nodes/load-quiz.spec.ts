import { makeLoadQuizNode } from "./load-quiz";
import { QuizState } from "../state";
import { makePrismaMock } from "../../common/testing";
import { LoadQuizError } from "../../common/errors";
import { makeDbQuiz, makeQuiz } from "../quiz-fixtures";

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  draft: undefined,
  generationRetries: undefined,
  quiz: undefined,
  startedAt: undefined,
  answers: {},
  scores: {},
  finalScore: undefined,
  attemptId: undefined,
};

describe("loadQuizNode", () => {
  it("returns the stored quiz and a start time when a row matches the source url", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    prisma.quiz.findFirst.mockResolvedValue(makeDbQuiz(quizId));

    // ACT:
    const result = await makeLoadQuizNode(prisma)(state, {} as never);

    // ASSERT:
    expect(result).toEqual({
      quiz: makeQuiz(quizId),
      startedAt: expect.any(String) as unknown,
    });
    expect(prisma.quiz.findFirst).toHaveBeenCalledWith({
      where: { sourceUrl: state.readme_url },
      orderBy: { createdAt: "desc" },
      include: {
        questions: {
          orderBy: { position: "asc" },
          include: { options: { orderBy: { position: "asc" } } },
        },
      },
    });
  });

  it("returns an empty update when no row matches the source url", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    prisma.quiz.findFirst.mockResolvedValue(null);

    // ACT:
    const result = await makeLoadQuizNode(prisma)(state, {} as never);

    // ASSERT:
    expect(result).toEqual({});
  });

  it("leaves the state unchanged when the quiz is already loaded", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithQuiz = { ...state, quiz: makeQuiz(crypto.randomUUID()) };

    // ACT:
    const result = await makeLoadQuizNode(prisma)(stateWithQuiz, {} as never);

    // ASSERT:
    expect(result).toEqual({});
    expect(prisma.quiz.findFirst).not.toHaveBeenCalled();
  });

  it("throws when the lookup fails", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const dbError = new Error("Database error");
    prisma.quiz.findFirst.mockRejectedValue(dbError);

    // ACT:
    const promise = makeLoadQuizNode(prisma)(state, {} as never);

    // ASSERT: class, message, and preserved cause each checked on their own.
    await expect(promise).rejects.toBeInstanceOf(LoadQuizError);
    await expect(promise).rejects.toMatchObject({
      message: "Quiz lookup failed: Database error",
      cause: dbError,
    });
  });
});
