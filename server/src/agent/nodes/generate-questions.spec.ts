import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseMessage } from "@langchain/core/messages";
import { QuizState } from "../../agent/state";
import { makeDraft } from "../quiz-fixtures";
import { makeGenerateQuestionsNode } from "./generate-questions";
import { CommandInstance } from "@langchain/langgraph";
import { GenerateQuestionsError } from "../../common/errors";

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
  it("uses the source to generate questions using an LLM", async () => {
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(fakeQuiz)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await makeGenerateQuestionsNode(llm)(state, {} as never);

    assert.notInstanceOf(result, CommandInstance);

    assert.isDefined(result.draft);
    assert.equal(result.draft.title, fakeQuiz.title);
    assert.equal(result.draft.description, fakeQuiz.description);
    assert.equal(result.generationRetries, 0);

    expect(llmSpy).toHaveBeenCalledOnce();

    const [input] = llmSpy.mock.calls[0];
    const [system, human] = input as BaseMessage[];

    expect(system.content).toContain(
      "You are a helpful assistant that generates questions for a quiz",
    );
    expect(human.content).toContain("This is a test.");
  });

  it("throws a GenerateQuestionsError when schema failures exhaust all attempts", async () => {
    const llm = new FakeListChatModel({
      responses: ["{ invalid json }"],
    });

    await expect(
      makeGenerateQuestionsNode(llm, 1)(state, {} as never),
    ).rejects.toThrow(GenerateQuestionsError);
  });

  it("feeds the schema error back to the model on the next attempt", async () => {
    const llm = new FakeListChatModel({
      responses: ["{}", JSON.stringify(fakeQuiz)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await makeGenerateQuestionsNode(llm, 2)(state, {} as never);

    assert.notInstanceOf(result, CommandInstance);
    assert.isDefined(result.draft);
    assert.equal(result.draft.title, "hello");
    assert.equal(result.generationRetries, 1);
    expect(llmSpy).toHaveBeenCalledTimes(2);

    const [retryInput] = llmSpy.mock.calls[1];
    const retryMessages = retryInput as BaseMessage[];
    const feedback = retryMessages[retryMessages.length - 1];

    expect(feedback.content).toContain("title");
  });

  it("re-prompts when the provider rejects a malformed tool call", async () => {
    // Groq validates tool call JSON on the server. A malformed call
    // comes back as a 400 BadRequestError with code tool_use_failed,
    // not as a local parse error. The repair round must still engage.
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(fakeQuiz)],
    });
    const groqError = Object.assign(
      new Error('400 {"error":{"code":"tool_use_failed"}}'),
      {
        status: 400,
        error: {
          error: {
            message: "Failed to call a function. Please adjust your prompt.",
            type: "invalid_request_error",
            code: "tool_use_failed",
            failed_generation: '{"title": "broken"',
          },
        },
      },
    );
    const llmSpy = vi.spyOn(llm, "invoke").mockRejectedValueOnce(groqError);

    const result = await makeGenerateQuestionsNode(llm, 2)(state, {} as never);

    assert.notInstanceOf(result, CommandInstance);
    assert.isDefined(result.draft);
    assert.equal(result.draft.title, "hello");
    expect(llmSpy).toHaveBeenCalledTimes(2);

    const [retryInput] = llmSpy.mock.calls[1];
    const retryMessages = retryInput as BaseMessage[];
    const feedback = retryMessages[retryMessages.length - 1];

    expect(feedback.content).toContain("schema");
  });

  it("re-prompts when the parser error comes from a second langchain copy", async () => {
    // The evals runner loads @langchain/core twice: ESM in evals, CJS
    // through the server sources. An OutputParserException from the
    // other copy fails instanceof, so the check must read the error by
    // shape (lc_error_code), like isToolUseFailure does.
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(fakeQuiz)],
    });
    const foreignParserError = Object.assign(
      new Error("Failed to parse. Text: ..."),
      { lc_error_code: "OUTPUT_PARSING_FAILURE" },
    );
    const llmSpy = vi
      .spyOn(llm, "invoke")
      .mockRejectedValueOnce(foreignParserError);

    const result = await makeGenerateQuestionsNode(llm, 2)(state, {} as never);

    assert.notInstanceOf(result, CommandInstance);
    assert.isDefined(result.draft);
    assert.equal(result.draft.title, "hello");
    expect(llmSpy).toHaveBeenCalledTimes(2);
  });

  it("raises model call errors immediately without retrying", async () => {
    const llm = new FakeListChatModel({
      responses: ['{"title":"hello"}'],
    });
    const llmSpy = vi
      .spyOn(llm, "invoke")
      .mockRejectedValue(new Error("Invalid API key"));

    await expect(
      makeGenerateQuestionsNode(llm, 2)(state, {} as never),
    ).rejects.toThrow("Invalid API key");

    expect(llmSpy).toHaveBeenCalledOnce();
  });
});
