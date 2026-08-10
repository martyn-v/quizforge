import { FakeListChatModel } from "@langchain/core/utils/testing";
import {
  Command,
  INTERRUPT,
  isInterrupted,
  MemorySaver,
} from "@langchain/langgraph";
import { AskQuestionPayloadSchema } from "@quizforge/shared";
import { buildQuizGraph } from "./graph";
import { makeDbQuiz, makeDraft, makeQuiz, oid, qid } from "./quiz-fixtures";
import { makePrismaMock } from "../common/testing";
import { PrismaClient } from "../generated/prisma/client";
import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
} from "../scoring/scoring-modes";
import { ScoringService } from "../scoring/scoring.service";

/**
 * Journey tests. They run the compiled graph, so they cover the nodes and the
 * edges between them. Only the model and the network are substituted.
 *
 * MemorySaver keeps the real checkpoint behaviour, which interrupt() and
 * Command({ resume }) depend on, without a database.
 */

const BLOB_URL = "https://github.com/pipecat-ai/pipecat/blob/main/README.md";
const RAW_URL =
  "https://raw.githubusercontent.com/pipecat-ai/pipecat/main/README.md";

/** Answers every request with the same body. The tests never reach GitHub. */
function stubFetch(body: string) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function buildTestGraph(
  modelResponses: string[] = [],
  prisma: PrismaClient = makePrismaMock(),
) {
  return buildQuizGraph(
    new FakeListChatModel({ responses: modelResponses }),
    new MemorySaver(),
    prisma,
    new ScoringService(
      MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.SPEC],
    ),
    {
      model: "modelName",
      strategy: "strategy",
    },
  );
}

let threadCount = 0;

/** A fresh thread per run, so one test cannot resume another test's state. */
function newThread() {
  threadCount += 1;
  return { configurable: { thread_id: `journey-${threadCount}` } };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the quiz graph", () => {
  const fakeDraft = makeDraft();

  // The correct option ids per question, from the fixture layout:
  // single questions take their one correct option, multi questions
  // take both correct options.
  const correctSelections = [
    [oid(0, 2)],
    [oid(1, 1), oid(1, 3)],
    [oid(2, 0)],
    [oid(3, 0), oid(3, 1)],
    [oid(4, 3)],
  ];

  it("converts the url, fetches the source, generates the questions, persists the quiz, collects answers, scores them, and persists the attempt to the database", async () => {
    // ARRANGE:
    stubFetch("# Title");
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    prisma.quiz.create.mockResolvedValue(makeDbQuiz(quizId));
    prisma.attempt.create.mockResolvedValue({ id: attemptId } as never);
    const graph = buildTestGraph([JSON.stringify(fakeDraft)], prisma);
    const thread = newThread();

    // ACT:
    // First stage: fetchSource -> generateQuestions -> persistQuiz
    let result = await graph.invoke({ readme_url: BLOB_URL }, thread);
    expect(prisma.quiz.create).toHaveBeenCalledOnce();
    // Second stage: askQuestion, which is a loop over the questions
    for (const [index, question] of fakeDraft.questions.entries()) {
      // Check the interrupt here to see it match the quiz questions, then post the answer to continue
      assert(isInterrupted(result));

      const payload = AskQuestionPayloadSchema.parse(
        result[INTERRUPT][0].value,
      );
      expect(payload.index).toEqual(index);
      expect(payload.question.id).toEqual(qid(index));
      expect(payload.question.text).toEqual(question.text);
      expect(payload.question.type).toEqual(question.type);
      expect(JSON.stringify(result[INTERRUPT][0].value)).not.toContain(
        "isCorrect",
      ); // Ensure the correct answer doesnt leak

      // Resume with an answer; the next invoke returns the next pause (or final state).
      result = await graph.invoke(
        new Command({ resume: { selections: correctSelections[index] } }),
        thread,
      );
    }

    // ASSERT: every answer was correct; multi questions score 2 under
    // the SPEC rule because it counts correct selections.
    expect(result).toEqual({
      readme_url: RAW_URL,
      source: "# Title",
      draft: fakeDraft,
      generationRetries: 0,
      quiz: makeQuiz(quizId),
      startedAt: expect.any(String) as unknown,
      answers: {
        [qid(0)]: correctSelections[0],
        [qid(1)]: correctSelections[1],
        [qid(2)]: correctSelections[2],
        [qid(3)]: correctSelections[3],
        [qid(4)]: correctSelections[4],
      },
      scores: {
        [qid(0)]: 4,
        [qid(1)]: 2,
        [qid(2)]: 4,
        [qid(3)]: 2,
        [qid(4)]: 4,
      },
      finalScore: expect.closeTo(3.2036, 3) as number,
      attemptId,
    });
    // Still once: a resume replays only the interrupted askQuestion node,
    // never the completed persistQuiz node.
    expect(prisma.quiz.create).toHaveBeenCalledOnce();
    expect(prisma.attempt.create).toHaveBeenCalledOnce();
  });

  it("requests the raw url, never the blob url", async () => {
    const fetchMock = stubFetch("# Title");
    const prisma = makePrismaMock();
    prisma.quiz.create.mockResolvedValue(makeDbQuiz(crypto.randomUUID()));

    await buildTestGraph([JSON.stringify(fakeDraft)], prisma).invoke(
      { readme_url: BLOB_URL },
      newThread(),
    );

    expect(fetchMock).toHaveBeenCalledWith(RAW_URL, expect.anything());
  });

  it("fails the run when the url is not accepted", async () => {
    const fetchMock = stubFetch("# Title");

    await expect(
      buildTestGraph().invoke(
        { readme_url: "https://example.com/README.md" },
        newThread(),
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles invalid resumes by reprompting", async () => {
    // ARRANGE:
    stubFetch("# Title");
    const prisma = makePrismaMock();
    prisma.quiz.create.mockResolvedValue(makeDbQuiz(crypto.randomUUID()));
    const graph = buildTestGraph([JSON.stringify(fakeDraft)], prisma);
    const thread = newThread();

    // ACT & ASSERT:
    // First stage: fetchSource -> generateQuestions -> persistQuiz
    const result = await graph.invoke({ readme_url: BLOB_URL }, thread);
    expect(prisma.quiz.create).toHaveBeenCalledOnce();
    assert(isInterrupted(result));

    // Post a malformed answer (an option index, the old wire contract).
    const invalidAnswerResult = await graph.invoke(
      new Command({ resume: { selections: [99] } }),
      thread,
    );

    // Check if we're getting the same question and a reason back.
    assert(isInterrupted(invalidAnswerResult));
    const payload = AskQuestionPayloadSchema.parse(
      invalidAnswerResult[INTERRUPT][0].value,
    );
    expect(payload.index).toEqual(0);
    expect(payload.question.text).toEqual(fakeDraft.questions[0].text);
    expect(payload.question.type).toEqual(fakeDraft.questions[0].type);
    expect(
      JSON.stringify(invalidAnswerResult[INTERRUPT][0].value),
    ).not.toContain("isCorrect"); // Ensure the correct answer doesnt leak
    expect(payload.reason).toContain("Invalid response:");

    // Post a well-formed option id that belongs to another question.
    const foreignAnswerResult = await graph.invoke(
      new Command({ resume: { selections: [oid(1, 0)] } }),
      thread,
    );

    assert(isInterrupted(foreignAnswerResult));
    const foreignPayload = AskQuestionPayloadSchema.parse(
      foreignAnswerResult[INTERRUPT][0].value,
    );
    expect(foreignPayload.index).toEqual(0);
    expect(foreignPayload.reason).toEqual(
      "Unknown option id for this question.",
    );

    // Resume with a valid answer; the next invoke returns the next pause (or final state).
    const validAnswerResult = await graph.invoke(
      new Command({ resume: { selections: [oid(0, 0)] } }),
      thread,
    );

    // Check the interrupt here to see it move to the next question.
    assert(isInterrupted(validAnswerResult));
    const validPayload = AskQuestionPayloadSchema.parse(
      validAnswerResult[INTERRUPT][0].value,
    );
    expect(validPayload.index).toEqual(1);
    expect(validPayload.question.text).toEqual(fakeDraft.questions[1].text);
    expect(validPayload.question.type).toEqual(fakeDraft.questions[1].type);
    expect(validPayload.reason).toBeUndefined(); // No reason for valid answer
  });
});
