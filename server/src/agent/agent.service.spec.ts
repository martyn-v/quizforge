import { Command, INTERRUPT } from "@langchain/langgraph";
import type { AskQuestionPayload } from "@quizforge/shared";
import { InvalidStateError, SessionNotFoundError } from "../common/errors";
import { AgentService } from "./agent.service";
import { buildQuizGraph } from "./graph";
import { makeQuiz, oid, qid } from "./quiz-fixtures";

// The service compiles the graph in onModuleInit. The spec replaces the
// whole graph with one invoke mock, so no node, model or database runs.
vi.mock("./graph", () => ({ buildQuizGraph: vi.fn() }));

const buildQuizGraphMock = vi.mocked(buildQuizGraph);

const checkpointer = {} as never;
const llm = {} as never;
const generationStrategy = {} as never;
const scoringService = {} as never;

/** A valid first-question payload, as the askQuestion interrupt carries it. */
const firstQuestion: AskQuestionPayload = {
  question: {
    id: qid(0),
    text: "Question 1",
    type: "single",
    options: [0, 1, 2, 3].map((o) => ({
      id: oid(0, o),
      text: `Option ${o + 1}`,
    })),
  },
  index: 0,
  total: 5,
};

/** The shape isInterrupted() recognises on an invoke result. */
function interruptedWith(value: unknown) {
  return { [INTERRUPT]: [{ value }] };
}

/** A getState snapshot for a thread paused at an interrupt. */
function pausedSnapshot(value: unknown) {
  return {
    values: {},
    next: ["askQuestion"],
    tasks: [{ interrupts: [{ value }] }],
    createdAt: "2026-08-08T00:00:00.000Z",
  };
}

/** A getState snapshot for a thread that ran to completion. */
function completedSnapshot(values: Record<string, unknown>) {
  return { values, next: [], tasks: [], createdAt: "2026-08-08T00:00:00.000Z" };
}

/** The snapshot getState returns when no checkpoint exists. */
function unknownSnapshot() {
  return { values: {}, next: [], tasks: [] };
}

function makeService() {
  const invoke = vi.fn();
  const getState = vi.fn().mockResolvedValue(pausedSnapshot(firstQuestion));
  buildQuizGraphMock.mockReturnValue({ invoke, getState } as never);
  const prisma = { $disconnect: vi.fn() };
  const service = new AgentService(
    checkpointer,
    llm,
    generationStrategy,
    "modelName",
    prisma as never,
    scoringService,
  );
  service.onModuleInit();
  return { service, invoke, getState, prisma };
}

beforeEach(() => {
  buildQuizGraphMock.mockReset();
});

describe("AgentService", () => {
  it("compiles the graph once at bootstrap with the injected dependencies", () => {
    const { prisma } = makeService();

    expect(buildQuizGraphMock).toHaveBeenCalledExactlyOnceWith(
      llm,
      checkpointer,
      prisma,
      scoringService,
      { model: "modelName", strategy: generationStrategy },
    );
  });

  it("disconnects prisma on shutdown", async () => {
    const { service, prisma } = makeService();

    await service.onModuleDestroy();

    expect(prisma.$disconnect).toHaveBeenCalledOnce();
  });

  describe("startSession", () => {
    it("runs the graph to the first interrupt and returns the first question", async () => {
      // ARRANGE:
      const { service, invoke } = makeService();
      invoke.mockResolvedValue(interruptedWith(firstQuestion));

      // ACT:
      const result = await service.startSession(
        "https://github.com/o/r/blob/main/README.md",
      );

      // ASSERT:
      expect(result.question).toEqual(firstQuestion);
      expect(invoke).toHaveBeenCalledExactlyOnceWith(
        { readme_url: "https://github.com/o/r/blob/main/README.md" },
        {
          configurable: { thread_id: result.sessionId },
          metadata: { strategy: generationStrategy, model: "modelName" },
        },
      );
    });

    it("strips isCorrect even when the interrupt payload carries it", async () => {
      // ARRANGE: the graph never sends isCorrect. If a regression brings
      // it back, this boundary must still remove it (AGENTS.md rule 2).
      const { service, invoke } = makeService();
      const leaked = {
        ...firstQuestion,
        question: {
          ...firstQuestion.question,
          options: firstQuestion.question.options.map((o) => ({
            ...o,
            isCorrect: true,
          })),
        },
      };
      invoke.mockResolvedValue(interruptedWith(leaked));

      // ACT:
      const result = await service.startSession(
        "https://github.com/o/r/blob/main/README.md",
      );

      // ASSERT:
      expect(JSON.stringify(result.question)).not.toContain("isCorrect");
      expect(result.question).toEqual(firstQuestion);
    });

    it("throws when the graph completes without an interrupt", async () => {
      // ARRANGE:
      const { service, invoke } = makeService();
      invoke.mockResolvedValue({ finalScore: 4 });

      // ACT: run once, then check class and message on their own. The
      // class is what the exception filter switches on.
      const promise = service.startSession(
        "https://github.com/o/r/blob/main/README.md",
      );

      // ASSERT:
      await expect(promise).rejects.toBeInstanceOf(InvalidStateError);
      await expect(promise).rejects.toThrow(
        "Expected the graph to be interrupted after starting a session",
      );
    });
  });

  describe("submitAnswer", () => {
    it("resumes the thread with the selections and returns the next question", async () => {
      // ARRANGE:
      const { service, invoke } = makeService();
      const threadId = crypto.randomUUID();
      invoke.mockResolvedValue(interruptedWith(firstQuestion));

      // ACT:
      const response = await service.submitAnswer(threadId, [oid(0, 2)]);

      // ASSERT:
      expect(response).toEqual({ kind: "question", question: firstQuestion });
      expect(invoke).toHaveBeenCalledExactlyOnceWith(expect.any(Command), {
        configurable: { thread_id: threadId },
      });
      const command = invoke.mock.calls[0][0] as Command;
      expect(command.resume).toEqual({ selections: [oid(0, 2)] });
    });

    it("returns the result on completion without leaking the quiz", async () => {
      // ARRANGE: a completed run resolves with the full final state,
      // including the quiz with its isCorrect flags. Only the result
      // fields may cross the boundary (AGENTS.md rule 2).
      const { service, invoke } = makeService();
      const attemptId = crypto.randomUUID();
      const scores = { [qid(0)]: 4, [qid(1)]: 2 };
      invoke.mockResolvedValue({
        readme_url: "https://raw.githubusercontent.com/o/r/main/README.md",
        source: "# Title",
        draft: undefined,
        quiz: makeQuiz(crypto.randomUUID()),
        answers: { [qid(0)]: [oid(0, 2)], [qid(1)]: [oid(1, 1)] },
        scores,
        finalScore: 3.05,
        attemptId,
      });

      // ACT:
      const response = await service.submitAnswer(crypto.randomUUID(), [
        oid(1, 1),
      ]);

      // ASSERT:
      expect(response).toEqual({
        kind: "result",
        result: { finalScore: 3.05, scores, attemptId },
      });
      expect(JSON.stringify(response)).not.toContain("isCorrect");
    });

    it("rejects loudly when the final state is missing the attempt", async () => {
      // ARRANGE: a completed run whose finalize never wrote the attempt.
      // Field-picking would ship undefined and the frontend would break
      // quietly; the schema parse must throw instead.
      const { service, invoke } = makeService();
      invoke.mockResolvedValue({
        readme_url: "https://raw.githubusercontent.com/o/r/main/README.md",
        source: "# Title",
        draft: undefined,
        quiz: makeQuiz(crypto.randomUUID()),
        answers: { [qid(0)]: [oid(0, 2)] },
        scores: { [qid(0)]: 4 },
        finalScore: 4,
        attemptId: undefined,
      });

      // ACT & ASSERT: the error names the missing field.
      await expect(
        service.submitAnswer(crypto.randomUUID(), [oid(0, 2)]),
      ).rejects.toThrow(/attemptId/);
    });

    it("throws SessionNotFoundError without resuming when the session is unknown", async () => {
      // ARRANGE: no checkpoint for this thread id.
      const { service, invoke, getState } = makeService();
      getState.mockResolvedValue(unknownSnapshot());

      // ACT & ASSERT: the class maps to a 404, and the graph must not
      // start a fresh run from a resume command.
      await expect(
        service.submitAnswer(crypto.randomUUID(), [oid(0, 2)]),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("resumes the thread on an invalid answer and reprompts", async () => {
      // ARRANGE:
      const { service, invoke } = makeService();
      const threadId = crypto.randomUUID();
      invoke.mockResolvedValue(
        interruptedWith({ ...firstQuestion, reason: "Invalid answer" }),
      );

      // ACT:
      const response = await service.submitAnswer(threadId, [oid(0, 2)]);

      // ASSERT:
      expect(response).toEqual({
        kind: "question",
        question: { ...firstQuestion, reason: "Invalid answer" },
      });
      expect(invoke).toHaveBeenCalledExactlyOnceWith(expect.any(Command), {
        configurable: { thread_id: threadId },
      });
      const command = invoke.mock.calls[0][0] as Command;
      expect(command.resume).toEqual({ selections: [oid(0, 2)] });
    });
  });

  describe("getSession", () => {
    it("returns the pending question for a session paused at an interrupt", async () => {
      // ARRANGE:
      const { service, getState } = makeService();
      const sessionId = crypto.randomUUID();
      getState.mockResolvedValue(pausedSnapshot(firstQuestion));

      // ACT:
      const response = await service.getSession(sessionId);

      // ASSERT:
      expect(response).toEqual({ kind: "question", question: firstQuestion });
      expect(getState).toHaveBeenCalledExactlyOnceWith({
        configurable: { thread_id: sessionId },
      });
    });

    it("strips isCorrect even when the snapshot payload carries it", async () => {
      // ARRANGE: same boundary rule as startSession (AGENTS.md rule 2).
      const { service, getState } = makeService();
      const leaked = {
        ...firstQuestion,
        question: {
          ...firstQuestion.question,
          options: firstQuestion.question.options.map((o) => ({
            ...o,
            isCorrect: true,
          })),
        },
      };
      getState.mockResolvedValue(pausedSnapshot(leaked));

      // ACT:
      const response = await service.getSession(crypto.randomUUID());

      // ASSERT:
      expect(JSON.stringify(response)).not.toContain("isCorrect");
      expect(response).toEqual({ kind: "question", question: firstQuestion });
    });

    it("returns the result for a completed session without leaking the quiz", async () => {
      // ARRANGE: the final state carries the quiz with isCorrect flags.
      const { service, getState } = makeService();
      const attemptId = crypto.randomUUID();
      const scores = { [qid(0)]: 4, [qid(1)]: 2 };
      getState.mockResolvedValue(
        completedSnapshot({
          quiz: makeQuiz(crypto.randomUUID()),
          scores,
          finalScore: 3.05,
          attemptId,
        }),
      );

      // ACT:
      const response = await service.getSession(crypto.randomUUID());

      // ASSERT:
      expect(response).toEqual({
        kind: "result",
        result: { finalScore: 3.05, scores, attemptId },
      });
      expect(JSON.stringify(response)).not.toContain("isCorrect");
    });

    it("throws SessionNotFoundError when the session is unknown", async () => {
      // ARRANGE:
      const { service, getState } = makeService();
      getState.mockResolvedValue(unknownSnapshot());

      // ACT & ASSERT:
      await expect(
        service.getSession(crypto.randomUUID()),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
    });

    it("throws when a known session is neither paused nor completed", async () => {
      // ARRANGE: a thread that died between nodes has a checkpoint but
      // no interrupt and no result. Field-picking would ship undefined.
      const { service, getState } = makeService();
      getState.mockResolvedValue(
        completedSnapshot({ readme_url: "https://example.com" }),
      );

      // ACT & ASSERT:
      await expect(
        service.getSession(crypto.randomUUID()),
      ).rejects.toBeInstanceOf(InvalidStateError);
    });
  });
});
