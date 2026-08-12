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
  generationRetries: undefined,
  quiz: undefined,
  startedAt: undefined,
  answers: {},
  scores: {},
  finalScore: undefined,
  attemptId: undefined,
};

describe("persistQuizNode", () => {
  it("persists the draft and returns the quiz with database ids and shuffled options", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    const dbQuiz = makeDbQuiz(quizId);
    prisma.quiz.create.mockResolvedValue(dbQuiz);

    // ACT:
    const result = await makePersistQuizNode(prisma, {
      strategy: "strategy",
      model: "modelName",
    })(state, {} as never);

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result).toBeDefined();
    expect(result.quiz).toBeDefined();
    expect(result.startedAt).toEqual(expect.any(String) as unknown);

    // Verify the quiz structure matches, but don't over-specify option order
    // since they are randomized.
    const { quiz } = result;
    expect(quiz?.id).toBe(quizId);
    expect(quiz?.title).toBe("hello");
    expect(quiz?.description).toBe("this is a quiz");
    expect(quiz?.questions).toHaveLength(dbQuiz.questions.length);

    // Verify each question has the same options but possibly in different order
    for (let i = 0; i < (quiz?.questions.length ?? 0); i++) {
      const q = quiz?.questions[i];
      const dbQ = dbQuiz.questions[i];
      expect(q?.text).toBe(dbQ.text);
      expect(q?.id).toBe(dbQ.id);
      expect(q?.type).toBe(dbQ.type === "SINGLE" ? "single" : "multi");
      expect(q?.options).toHaveLength(dbQ.options.length);

      // Verify all option ids and texts are present (in any order)
      const optionIds = new Set(q?.options.map((o) => o.id));
      const dbOptionIds = new Set(dbQ.options.map((o) => o.id));
      expect(optionIds).toEqual(dbOptionIds);
    }

    // Verify that quiz.create was called with shuffled options
    const createCall = prisma.quiz.create.mock.calls[0]?.[0];
    expect(createCall).toBeDefined();
    expect(createCall?.data.sourceUrl).toBe(
      "https://raw.githubusercontent.com/owner/repo/main/README.md",
    );
    expect(createCall?.data.title).toBe("hello");
    expect(createCall?.data.description).toBe("this is a quiz");
    expect(createCall?.data.strategy).toBe("strategy");
    expect(createCall?.data.model).toBe("modelName");

    // Verify options were shuffled: same options present but order may differ
    const draftQuestions = makeDraft().questions;
    interface CreateQuestionInput {
      text?: string;
      type?: string;
      options?: { create: { text: string }[] };
    }
    const createQs = (createCall?.data.questions?.create as CreateQuestionInput[] | undefined) ?? [];
    expect(createQs).toHaveLength(draftQuestions.length);

    for (let i = 0; i < draftQuestions.length; i++) {
      const draftQ = draftQuestions[i];
      const createQ = createQs[i];
      expect(createQ.text).toBe(draftQ.text);
      expect(createQ.type).toBe(draftQ.type === "single" ? "SINGLE" : "MULTI");
      expect(createQ.options?.create).toHaveLength(draftQ.options.length);

      // Verify all original options are present (order may differ due to shuffle)
      const originalOptionTexts = new Set(draftQ.options.map((o) => o.text));
      const createOptionTexts = new Set(
        (createQ.options?.create ?? []).map((o) => o.text),
      );
      expect(createOptionTexts).toEqual(originalOptionTexts);
    }
  });

  it("is idempotent once the quiz is in state", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithQuiz = { ...state, quiz: makeQuiz(crypto.randomUUID()) };

    // ACT:
    const result = await makePersistQuizNode(prisma, {
      strategy: "strategy",
      model: "modelName",
    })(stateWithQuiz, {} as never);

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
      makePersistQuizNode(prisma, {
        strategy: "strategy",
        model: "modelName",
      })(stateWithoutDraft, {} as never),
    ).rejects.toThrowError(InvalidStateError);
  });

  it("throws when there is an error persisting the quiz", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const dbError = new Error("Database error");
    prisma.quiz.create.mockRejectedValue(dbError);

    // ACT:
    const promise = makePersistQuizNode(prisma, {
      strategy: "strategy",
      model: "modelName",
    })(state, {} as never);

    // ASSERT: class, message, and preserved cause each checked on their own.
    // toThrowError(new PersistQuizError(...)) compares only the message.
    await expect(promise).rejects.toBeInstanceOf(PersistQuizError);
    await expect(promise).rejects.toMatchObject({
      message: "Quiz could not be saved: Database error",
      cause: dbError,
    });
  });
});
