import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseMessage } from "@langchain/core/messages";
import type { QuizSchema } from "../../agent/agent.schemas";
import { QuizState } from "../../agent/state";
import { z } from "zod/v4";
import { makeGenerateQuestionsNode } from "./generate-questions";
import { CommandInstance } from "@langchain/langgraph";
import { GenerateQuestionsError } from "../../common/errors";

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  quiz: undefined,
  quizId: undefined,
  answers: [],
  scores: [],
  finalScore: undefined,
};

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
describe("generateQuestionsNode", () => {
  it("uses the source to generate questions using an LLM", async () => {
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(fakeQuiz)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await makeGenerateQuestionsNode(llm)(state, {} as never);

    assert.notInstanceOf(result, CommandInstance);

    assert.isDefined(result.quiz);
    assert.equal(result.quiz.title, fakeQuiz.title);
    assert.equal(result.quiz.description, fakeQuiz.description);

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
    assert.isDefined(result.quiz);
    assert.equal(result.quiz.title, "hello");
    expect(llmSpy).toHaveBeenCalledTimes(2);

    const [retryInput] = llmSpy.mock.calls[1];
    const retryMessages = retryInput as BaseMessage[];
    const feedback = retryMessages[retryMessages.length - 1];

    expect(feedback.content).toContain("title");
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
