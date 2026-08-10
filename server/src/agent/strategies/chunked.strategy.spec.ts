import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseMessage } from "@langchain/core/messages";
import type { DraftQuiz } from "@quizforge/shared";
import { makeDraft } from "../quiz-fixtures";
import { makeChunkedStrategy } from "./chunked.strategy";
import { GenerationStrategy } from "./generation-strategy";
import { GenerateQuestionsError } from "../../common/errors";

// Small split bounds keep the fixtures readable; the defaults are for
// real READMEs.
const split = { minChars: 10, maxSections: 6 };

/** A source with the given section bodies, one ## heading each. */
function makeSource(...bodies: string[]): string {
  return bodies
    .map((body, i) => `## Section ${i + 1}\n${body}`)
    .join("\n");
}

/** A per-section response the chunk schema accepts. */
function makeChunkQuiz(...texts: string[]): DraftQuiz {
  return {
    title: "Chunk quiz",
    description: "From one section",
    questions: texts.map((text) => ({
      text,
      type: "single",
      options: [0, 1, 2, 3].map((o) => ({
        text: `Option ${o + 1}`,
        isCorrect: o === 0,
      })),
    })),
  };
}

function fakeLlm(...quizzes: DraftQuiz[]) {
  return new FakeListChatModel({
    responses: quizzes.map((q) => JSON.stringify(q)),
  });
}

describe("chunkedStrategy", () => {
  it("is named after the enum value it implements", () => {
    expect(makeChunkedStrategy().name).toBe(GenerationStrategy.CHUNKED);
  });

  it("makes one model call per section and each call sees only its section", async () => {
    const source = makeSource("Body about apples.", "Body about oranges.");
    const llm = fakeLlm(
      makeChunkQuiz("A1", "A2", "A3", "A4"),
      makeChunkQuiz("B1", "B2", "B3", "B4"),
    );
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await makeChunkedStrategy({ split }).generate(llm, source);

    expect(llmSpy).toHaveBeenCalledTimes(2);
    expect(result.draft.questions.map((q) => q.text)).toEqual([
      "A1",
      "A2",
      "A3",
      "A4",
      "B1",
      "B2",
      "B3",
      "B4",
    ]);

    for (const [call, fruit] of [
      [0, "apples"],
      [1, "oranges"],
    ] as const) {
      const [input] = llmSpy.mock.calls[call];
      const [, human] = input as BaseMessage[];
      expect(human.content).toContain(fruit);
      expect(human.content).not.toContain(fruit === "apples" ? "oranges" : "apples");
    }
  });

  it("takes the title and description from the first section response", async () => {
    const source = makeSource("Body about apples.", "Body about oranges.");
    const first = {
      ...makeChunkQuiz("A1", "A2", "A3"),
      title: "First title",
      description: "First description",
    };
    const llm = fakeLlm(first, makeChunkQuiz("B1", "B2", "B3"));

    const result = await makeChunkedStrategy({ split }).generate(llm, source);

    expect(result.draft.title).toBe("First title");
    expect(result.draft.description).toBe("First description");
  });

  it("delegates to one whole-document call when the source has one section", async () => {
    const wholeQuiz = makeDraft();
    const llm = fakeLlm(wholeQuiz);
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await makeChunkedStrategy({ split }).generate(
      llm,
      "Prose without any headings at all.",
    );

    expect(llmSpy).toHaveBeenCalledOnce();
    expect(result.draft.title).toBe(wholeQuiz.title);
    expect(result.draft.questions).toHaveLength(5);
  });

  it("removes duplicate questions by normalized text", async () => {
    const source = makeSource("Body about apples.", "Body about oranges.");
    const llm = fakeLlm(
      makeChunkQuiz("What is QuizForge?", "A2", "A3"),
      makeChunkQuiz("what is quizforge!", "B2", "B3"),
    );

    const result = await makeChunkedStrategy({ split }).generate(llm, source);

    expect(result.draft.questions.map((q) => q.text)).toEqual([
      "What is QuizForge?",
      "A2",
      "A3",
      "B2",
      "B3",
    ]);
  });

  it("selects at most 8 questions, spread across the sections", async () => {
    const source = makeSource(
      "Body about apples.",
      "Body about oranges.",
      "Body about pears.",
    );
    const llm = fakeLlm(
      makeChunkQuiz("A1", "A2", "A3"),
      makeChunkQuiz("B1", "B2", "B3"),
      makeChunkQuiz("C1", "C2", "C3"),
    );

    const result = await makeChunkedStrategy({ split }).generate(llm, source);

    // Nine unique questions; the third round stops at 8, so the last
    // section loses its final question. Document order is preserved.
    expect(result.draft.questions.map((q) => q.text)).toEqual([
      "A1",
      "A2",
      "A3",
      "B1",
      "B2",
      "B3",
      "C1",
      "C2",
    ]);
  });

  it("throws a GenerateQuestionsError when fewer than 5 unique questions survive", async () => {
    const source = makeSource("Body about apples.", "Body about oranges.");
    const llm = fakeLlm(
      makeChunkQuiz("Same question?", "Other question?"),
      makeChunkQuiz("same question", "other question"),
    );

    const promise = makeChunkedStrategy({ split }).generate(llm, source);

    await expect(promise).rejects.toBeInstanceOf(GenerateQuestionsError);
    await expect(promise).rejects.toThrow(
      "2 unique questions; the quiz needs at least 5",
    );
  });

  it("sums the repair retries across the section calls", async () => {
    const source = makeSource("Body about apples.", "Body about oranges.");
    const llm = new FakeListChatModel({
      responses: [
        "{}",
        JSON.stringify(makeChunkQuiz("A1", "A2", "A3")),
        JSON.stringify(makeChunkQuiz("B1", "B2", "B3")),
      ],
    });

    const result = await makeChunkedStrategy({ split }).generate(llm, source);

    expect(result.generationRetries).toBe(1);
    expect(result.draft.questions).toHaveLength(6);
  });
});
