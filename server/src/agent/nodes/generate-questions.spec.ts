import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseMessage } from "@langchain/core/messages";
import { QuizState } from "../state";
import { makeDraft } from "../quiz-fixtures";
import { makeGenerateQuestionsNode } from "./generate-questions";
import { GenerationStrategy } from "../strategies/generation-strategy";
import { CommandInstance } from "@langchain/langgraph";

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

const fakeQuiz = makeDraft();

describe("generateQuestionsNode", () => {
  it("delegates to the given strategy with the state source", async () => {
    const llm = new FakeListChatModel({ responses: [] });
    const strategy = {
      name: GenerationStrategy.CHUNKED,
      generate: vi
        .fn()
        .mockResolvedValue({ draft: fakeQuiz, generationRetries: 3 }),
    };

    const result = await makeGenerateQuestionsNode(llm, strategy)(
      state,
      {} as never,
    );

    assert.notInstanceOf(result, CommandInstance);
    expect(strategy.generate).toHaveBeenCalledExactlyOnceWith(
      llm,
      "This is a test.",
    );
    expect(result).toEqual({ draft: fakeQuiz, generationRetries: 3 });
  });

  it("defaults to the single-pass strategy", async () => {
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(fakeQuiz)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await makeGenerateQuestionsNode(llm)(state, {} as never);

    assert.notInstanceOf(result, CommandInstance);
    assert.isDefined(result.draft);
    assert.equal(result.draft.title, fakeQuiz.title);
    assert.equal(result.generationRetries, 0);

    expect(llmSpy).toHaveBeenCalledOnce();
    const [input] = llmSpy.mock.calls[0];
    const [system, human] = input as BaseMessage[];
    expect(system.content).toContain(
      "You are a quiz generator that generates questions for a quiz",
    );
    expect(human.content).toContain("This is a test.");
  });
});
