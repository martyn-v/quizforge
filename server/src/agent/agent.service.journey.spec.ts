import { FakeListChatModel } from "@langchain/core/utils/testing";
import { MemorySaver } from "@langchain/langgraph";
import { SessionNotFoundError } from "../common/errors";
import { makePrismaMock } from "../common/testing";
import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
} from "../scoring/scoring-modes";
import { ScoringService } from "../scoring/scoring.service";
import { AgentService } from "./agent.service";
import { makeDbQuiz, makeDraft, oid, qid } from "./quiz-fixtures";

/**
 * Journey tests over the service surface. Unlike agent.service.spec.ts
 * they compile the real graph, so getSession reads real checkpointer
 * snapshots instead of hand-built ones.
 */

const BLOB_URL = "https://github.com/pipecat-ai/pipecat/blob/main/README.md";

function stubFetch(body: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
}

function makeService() {
  const prisma = makePrismaMock();
  prisma.quiz.create.mockResolvedValue(makeDbQuiz(crypto.randomUUID()));
  prisma.attempt.create.mockResolvedValue({
    id: crypto.randomUUID(),
  } as never);

  const service = new AgentService(
    new MemorySaver(),
    new FakeListChatModel({ responses: [JSON.stringify(makeDraft())] }),
    {} as never,
    "modelName",
    prisma,
    new ScoringService(
      MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.SPEC],
    ),
  );
  service.onModuleInit();
  return service;
}

// One valid selection set per fixture question, in order.
const selections = [
  [oid(0, 2)],
  [oid(1, 1), oid(1, 3)],
  [oid(2, 0)],
  [oid(3, 0), oid(3, 1)],
  [oid(4, 3)],
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentService against the real graph", () => {
  it("reads back the pending question, then the result, as the session advances", async () => {
    // ARRANGE:
    stubFetch("# Title");
    const service = makeService();

    // ACT & ASSERT: getSession mirrors the start response.
    const started = await service.startSession(BLOB_URL);
    expect(await service.getSession(started.sessionId)).toEqual({
      kind: "question",
      question: started.question,
    });

    // Walk the quiz. Each submit response must match a fresh read.
    let response = await service.submitAnswer(started.sessionId, selections[0]);
    for (let i = 1; i < selections.length; i++) {
      expect(response).toMatchObject({
        kind: "question",
        question: { index: i, question: { id: qid(i) } },
      });
      expect(await service.getSession(started.sessionId)).toEqual(response);
      response = await service.submitAnswer(started.sessionId, selections[i]);
    }

    // The last submit completes the run; a read returns the same result.
    expect(response.kind).toBe("result");
    expect(await service.getSession(started.sessionId)).toEqual(response);
    expect(JSON.stringify(response)).not.toContain("isCorrect");
  });

  it("throws SessionNotFoundError for an unknown session on read and on submit", async () => {
    const service = makeService();
    const unknown = crypto.randomUUID();

    await expect(service.getSession(unknown)).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
    await expect(
      service.submitAnswer(unknown, [oid(0, 0)]),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});
