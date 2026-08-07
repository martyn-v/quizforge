import { FakeListChatModel } from "@langchain/core/utils/testing";
import { MemorySaver } from "@langchain/langgraph";
import { buildQuizGraph } from "./graph";
import { QuizSchema } from "./agent.schemas";
import { z } from "zod/v4";
import { makePrismaMock } from "../common/testing";
import { PrismaClient, Quiz } from "../generated/prisma/client";

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
  const fakeQuiz: z.infer<typeof QuizSchema> = {
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
  };

  it("converts the url, fetches the source, generates the questions, persists the quiz, and puts everything in the state", async () => {
    // ARRANGE:
    stubFetch("# Title");
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    prisma.quiz.create.mockResolvedValue({ id: quizId } as Quiz);

    // ACT:
    const result = await buildTestGraph(
      [JSON.stringify(fakeQuiz)],
      prisma,
    ).invoke({ readme_url: BLOB_URL }, newThread());

    // ASSERT:
    expect(result).toEqual({
      readme_url: RAW_URL,
      source: "# Title",
      quiz: fakeQuiz,
      quizId,
    });
    expect(prisma.quiz.create).toHaveBeenCalledOnce();
  });

  it("requests the raw url, never the blob url", async () => {
    const fetchMock = stubFetch("# Title");
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    prisma.quiz.create.mockResolvedValue({ id: quizId } as Quiz);

    await buildTestGraph([JSON.stringify(fakeQuiz)], prisma).invoke(
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
});
