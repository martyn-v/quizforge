import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseMessage } from "@langchain/core/messages";
import { judgeQuestion, judgeCoverage } from "./judge.ts";
import type { EvalQuestion, EvalQuiz } from "./quiz-shape.ts";

const question: EvalQuestion = {
  text: "What does leftPad do?",
  type: "single",
  options: [
    { text: "Pads a string on the left", isCorrect: true },
    { text: "Pads a string on the right", isCorrect: false },
    { text: "Trims a string", isCorrect: false },
    { text: "Reverses a string", isCorrect: false },
  ],
};

const quiz: EvalQuiz = { title: "left-pad quiz", questions: [question] };

const verdict = {
  answerable: true,
  singleDefensibleAnswer: true,
  distractorsPlausible: true,
  reasoning: "The README states the behavior.",
};

describe("judgeQuestion", () => {
  it("returns the parsed verdict and sends source plus question", async () => {
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(verdict)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await judgeQuestion(llm, "String left pad", question);

    expect(result).toEqual(verdict);
    const [input] = llmSpy.mock.calls[0];
    const messages = input as BaseMessage[];
    const text = messages.map((m) => m.content).join("\n");
    expect(text).toContain("String left pad");
    expect(text).toContain("What does leftPad do?");
  });

  it("repairs once on a schema failure", async () => {
    const llm = new FakeListChatModel({
      responses: ["{}", JSON.stringify(verdict)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await judgeQuestion(llm, "src", question);

    expect(result).toEqual(verdict);
    expect(llmSpy).toHaveBeenCalledTimes(2);
  });

  it("fails loudly when the repair round also fails", async () => {
    const llm = new FakeListChatModel({ responses: ["{}", "{}"] });

    await expect(judgeQuestion(llm, "src", question)).rejects.toThrow(
      "Judge output did not match the schema",
    );
  });
});

describe("judgeCoverage", () => {
  it("returns key topics and covered topics", async () => {
    const coverage = {
      keyTopics: ["padding", "install", "usage"],
      coveredTopics: ["padding"],
    };
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(coverage)],
    });

    const result = await judgeCoverage(llm, "String left pad", quiz);

    expect(result).toEqual(coverage);
  });
});
