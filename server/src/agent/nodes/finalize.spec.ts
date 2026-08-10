import { CommandInstance } from "@langchain/langgraph";
import { makePrismaMock } from "../../common/testing";
import { makeQuiz, oid, qid } from "../quiz-fixtures";
import { QuizState } from "../state";
import { makeFinalizeNode } from "./finalize";

const QUIZ_ID = "412438f7-b949-41d0-aaae-6387d5bc9291";

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  draft: undefined,
  generationRetries: undefined,
  quiz: makeQuiz(QUIZ_ID),
  answers: {
    [qid(0)]: [oid(0, 2)],
    [qid(1)]: [oid(1, 1), oid(1, 3)],
    [qid(2)]: [oid(2, 0)],
    [qid(3)]: [oid(3, 0), oid(3, 1)],
    [qid(4)]: [oid(4, 3)],
  },
  startedAt: "2024-06-01T12:00:00.000Z",
  scores: {
    [qid(0)]: 4,
    [qid(1)]: 4,
    [qid(2)]: 4,
    [qid(3)]: 4,
    [qid(4)]: 4,
  },
  finalScore: 4,
  attemptId: undefined,
};

describe("finalizeNode", () => {
  it("persists the attempt, answers, and scores", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const threadId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    prisma.attempt.create.mockResolvedValue({
      id: attemptId,
    } as never);

    // ACT:
    const result = await makeFinalizeNode(prisma)(state, {
      configurable: { thread_id: threadId },
    } as never);

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result).toEqual({ attemptId });

    expect(prisma.attempt.create).toHaveBeenCalledWith({
      data: {
        quizId: QUIZ_ID,
        threadId: threadId,
        finalScore: 4,
        startedAt: "2024-06-01T12:00:00.000Z",
        answers: {
          create: [
            {
              questionId: qid(0),
              score: 4,
              selections: {
                create: [{ optionId: oid(0, 2) }],
              },
            },
            {
              questionId: qid(1),
              score: 4,
              selections: {
                create: [{ optionId: oid(1, 1) }, { optionId: oid(1, 3) }],
              },
            },
            {
              questionId: qid(2),
              score: 4,
              selections: {
                create: [{ optionId: oid(2, 0) }],
              },
            },
            {
              questionId: qid(3),
              score: 4,
              selections: {
                create: [{ optionId: oid(3, 0) }, { optionId: oid(3, 1) }],
              },
            },
            {
              questionId: qid(4),
              score: 4,
              selections: {
                create: [{ optionId: oid(4, 3) }],
              },
            },
          ],
        },
      },
    });
  });

  it("throws if state.quiz is missing", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithoutQuiz = { ...state, quiz: undefined };

    // ACT & ASSERT:
    await expect(
      makeFinalizeNode(prisma)(stateWithoutQuiz, {
        configurable: { thread_id: crypto.randomUUID() },
      } as never),
    ).rejects.toThrow("Missing required state property: quiz");
  });

  it("throws if state.startedAt is missing", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithoutStartedAt = { ...state, startedAt: undefined };

    // ACT & ASSERT:
    await expect(
      makeFinalizeNode(prisma)(stateWithoutStartedAt, {
        configurable: { thread_id: crypto.randomUUID() },
      } as never),
    ).rejects.toThrow("Missing required state property: startedAt");
  });

  it("throws if config.configurable.thread_id is missing", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();

    // ACT & ASSERT:
    await expect(
      makeFinalizeNode(prisma)(state, {
        configurable: {},
      } as never),
    ).rejects.toThrow("Missing required config property: thread_id");
  });

  it("throws if answers or scores are missing or incomplete", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithIncompleteAnswers = {
      ...state,
      answers: { [qid(0)]: [oid(0, 2)] }, // only one answer
    };

    // ACT & ASSERT:
    await expect(
      makeFinalizeNode(prisma)(stateWithIncompleteAnswers, {
        configurable: { thread_id: crypto.randomUUID() },
      } as never),
    ).rejects.toThrow("Answers or scores are missing or incomplete.");
  });

  it("throws if state.finalScore is missing", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithoutFinalScore = { ...state, finalScore: undefined };

    // ACT & ASSERT:
    await expect(
      makeFinalizeNode(prisma)(stateWithoutFinalScore, {
        configurable: { thread_id: crypto.randomUUID() },
      } as never),
    ).rejects.toThrow("Missing required state property: finalScore");
  });
});
