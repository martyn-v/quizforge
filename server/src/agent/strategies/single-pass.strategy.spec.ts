import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseMessage } from "@langchain/core/messages";
import { makeDraft } from "../quiz-fixtures";
import { makeSinglePassStrategy } from "./single-pass.strategy";
import { GenerationStrategy } from "./generation-strategy";
import { GenerateQuestionsError } from "../../common/errors";

const source = "This is a test.";
const fakeQuiz = makeDraft();

describe("singlePassStrategy", () => {
  it("is named after the enum value it implements", () => {
    expect(makeSinglePassStrategy().name).toBe(GenerationStrategy.SINGLE_PASS);
  });

  it("generates a draft from the source in one model call", async () => {
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(fakeQuiz)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await makeSinglePassStrategy().generate(llm, source);

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
      makeSinglePassStrategy(1).generate(llm, source),
    ).rejects.toThrow(GenerateQuestionsError);
  });

  it("feeds the schema error back to the model on the next attempt", async () => {
    const llm = new FakeListChatModel({
      responses: ["{}", JSON.stringify(fakeQuiz)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await makeSinglePassStrategy(2).generate(llm, source);

    assert.equal(result.draft.title, "hello");
    assert.equal(result.generationRetries, 1);
    expect(llmSpy).toHaveBeenCalledTimes(2);

    const [retryInput] = llmSpy.mock.calls[1];
    const retryMessages = retryInput as BaseMessage[];
    const feedback = retryMessages[retryMessages.length - 1];

    expect(feedback.content).toContain("title");
  });

  it("keeps the raw model output out of the exhausted-attempts error", async () => {
    // ARRANGE: a parser failure embeds the raw output, isCorrect flags
    // included, in its own message. The strategy error message crosses
    // the wire in an error response, so the raw text must stay in the
    // cause (AGENTS.md rule 2); only the model sees it during repair.
    const llm = new FakeListChatModel({ responses: ["unused"] });
    const parserError = Object.assign(
      new Error(
        'Failed to parse. Text: "{"options":[{"text":"a","isCorrect":true}]}"',
      ),
      { lc_error_code: "OUTPUT_PARSING_FAILURE" },
    );
    vi.spyOn(llm, "invoke").mockRejectedValue(parserError);

    // ACT:
    let thrown: unknown = new Error("the strategy did not throw");
    try {
      await makeSinglePassStrategy(1).generate(llm, source);
    } catch (error) {
      thrown = error;
    }

    // ASSERT: the class and attempt count survive, the raw text does not.
    expect(thrown).toBeInstanceOf(GenerateQuestionsError);
    const error = thrown as GenerateQuestionsError;
    expect(error.message).toContain("1 attempt");
    expect(error.message).not.toContain("isCorrect");
    expect(error.cause).toBe(parserError);
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

    const result = await makeSinglePassStrategy(2).generate(llm, source);

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

    const result = await makeSinglePassStrategy(2).generate(llm, source);

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
      makeSinglePassStrategy(2).generate(llm, source),
    ).rejects.toThrow("Invalid API key");

    expect(llmSpy).toHaveBeenCalledOnce();
  });
});
