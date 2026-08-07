import { CommandInstance } from "@langchain/langgraph";
import { makePersistQuizNode } from "./persist-quiz";
import { QuizState } from "../state";
import { makePrismaMock } from "../../common/testing";
import { Quiz } from "../../generated/prisma/client";
import { InvalidStateError, PersistQuizError } from "../../common/errors";

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  quiz: {
    title: "hello",
    description: "this is a quiz",
    questions: [
      {
        text: "Question 1",
        type: "single",
        options: [
          { text: "Option 1", isCorrect: true },
          { text: "Option 2", isCorrect: false },
          { text: "Option 3", isCorrect: false },
          { text: "Option 4", isCorrect: false },
        ],
      },
      {
        text: "Question 2",
        type: "multi",
        options: [
          { text: "Option 1", isCorrect: true },
          { text: "Option 2", isCorrect: true },
          { text: "Option 3", isCorrect: false },
          { text: "Option 4", isCorrect: false },
        ],
      },
      {
        text: "Question 3",
        type: "single",
        options: [
          { text: "Option 1", isCorrect: true },
          { text: "Option 2", isCorrect: false },
          { text: "Option 3", isCorrect: false },
          { text: "Option 4", isCorrect: false },
        ],
      },
      {
        text: "Question 4",
        type: "multi",
        options: [
          { text: "Option 1", isCorrect: true },
          { text: "Option 2", isCorrect: true },
          { text: "Option 3", isCorrect: false },
          { text: "Option 4", isCorrect: false },
        ],
      },
      {
        text: "Question 5",
        type: "single",
        options: [
          { text: "Option 1", isCorrect: true },
          { text: "Option 2", isCorrect: false },
          { text: "Option 3", isCorrect: false },
          { text: "Option 4", isCorrect: false },
        ],
      },
    ],
  },
  quizId: undefined,
};

describe("persistQuizNode", () => {
  it("should return the quizId", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    prisma.quiz.create.mockResolvedValue({ id: quizId } as Quiz);

    // ACT:
    const result = await makePersistQuizNode(prisma)(state, {} as never);

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result).toEqual({ quizId });

    expect(prisma.quiz.create).toHaveBeenCalledWith({
      data: {
        sourceUrl:
          "https://raw.githubusercontent.com/owner/repo/main/README.md",
        title: "hello",
        description: "this is a quiz",
        strategy: "todo",
        model: "todo",
        questions: {
          create: [
            {
              position: 0,
              text: "Question 1",
              type: "SINGLE",
              options: {
                create: [
                  { position: 0, text: "Option 1", isCorrect: true },
                  { position: 1, text: "Option 2", isCorrect: false },
                  { position: 2, text: "Option 3", isCorrect: false },
                  { position: 3, text: "Option 4", isCorrect: false },
                ],
              },
            },
            {
              position: 1,
              text: "Question 2",
              type: "MULTI",
              options: {
                create: [
                  { position: 0, text: "Option 1", isCorrect: true },
                  { position: 1, text: "Option 2", isCorrect: true },
                  { position: 2, text: "Option 3", isCorrect: false },
                  { position: 3, text: "Option 4", isCorrect: false },
                ],
              },
            },
            {
              position: 2,
              text: "Question 3",
              type: "SINGLE",
              options: {
                create: [
                  { position: 0, text: "Option 1", isCorrect: true },
                  { position: 1, text: "Option 2", isCorrect: false },
                  { position: 2, text: "Option 3", isCorrect: false },
                  { position: 3, text: "Option 4", isCorrect: false },
                ],
              },
            },
            {
              position: 3,
              text: "Question 4",
              type: "MULTI",
              options: {
                create: [
                  { position: 0, text: "Option 1", isCorrect: true },
                  { position: 1, text: "Option 2", isCorrect: true },
                  { position: 2, text: "Option 3", isCorrect: false },
                  { position: 3, text: "Option 4", isCorrect: false },
                ],
              },
            },
            {
              position: 4,
              text: "Question 5",
              type: "SINGLE",
              options: {
                create: [
                  { position: 0, text: "Option 1", isCorrect: true },
                  { position: 1, text: "Option 2", isCorrect: false },
                  { position: 2, text: "Option 3", isCorrect: false },
                  { position: 3, text: "Option 4", isCorrect: false },
                ],
              },
            },
          ],
        },
      },
    });
  });

  it("should be idempotent", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    const stateWithQuizId = { ...state, quizId };

    // ACT:
    const result = await makePersistQuizNode(prisma)(
      stateWithQuizId,
      {} as never,
    );

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result).toEqual({ quizId });
    expect(prisma.quiz.create).not.toHaveBeenCalled();
  });

  it("throws when the quiz not in the state", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithoutQuiz = { ...state, quiz: undefined };

    // ACT & ASSERT:
    await expect(
      makePersistQuizNode(prisma)(stateWithoutQuiz, {} as never),
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
