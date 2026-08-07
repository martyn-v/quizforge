import { interrupt } from "@langchain/langgraph";
import { QuizState } from "../state";
import { AskQuestionPayloadSchema } from "../agent.schemas";
import { makeAskQuestionNode } from "./ask-question";

// interrupt() only runs inside a graph, so the test replaces it. The mock is
// partial: everything else stays real, because QuizState needs StateSchema
// from the same module.
vi.mock("@langchain/langgraph", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langchain/langgraph")>()),
  interrupt: vi.fn(),
}));

const interruptMock = vi.mocked(interrupt);

/**
 * Scripts the resume values that interrupt returns, one per call. When the
 * script runs out the mock throws, which mirrors the real behaviour: an
 * unanswered interrupt pauses the node by throwing GraphInterrupt.
 *
 * Returns the payloads as deep copies taken at call time. The node mutates
 * and reuses one payload object per question, so the references stored in
 * interruptMock.mock.calls all show the final state, not the sequence.
 */
function scriptInterrupt(resumes: unknown[]) {
  const queue = [...resumes];
  const seen: unknown[] = [];
  interruptMock.mockImplementation((payload) => {
    seen.push(structuredClone(payload));
    if (queue.length === 0) {
      throw new Error("script exhausted: the node would pause here");
    }
    return queue.shift();
  });
  return seen;
}

beforeEach(() => {
  interruptMock.mockReset();
});

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  quiz: {
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
  },
  quizId: "412438f7-b949-41d0-aaae-6387d5bc9291",
  answers: [],
};

describe("askQuestionNode", () => {
  it("collects one answer per question, in order", () => {
    // ARRANGE:
    const seen = scriptInterrupt([
      { selections: [0] },
      { selections: [0, 1] },
      { selections: [2] },
      { selections: [1, 3] },
      { selections: [3] },
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({
      answers: [[0], [0, 1], [2], [1, 3], [3]],
    });
    expect(interruptMock).toHaveBeenCalledTimes(5);

    // Observe the payloads: question order and no isCorrect anywhere.
    // Parsing doubles as an assertion that every payload matches the schema.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
    expect(payloads.every((p) => p.reason === undefined)).toBe(true);
    expect(JSON.stringify(payloads)).not.toContain("isCorrect");
  });

  it("throws InvalidStateError if state.quiz is missing", () => {
    // ARRANGE:
    const stateWithoutQuiz = { ...state, quiz: undefined };

    // ACT & ASSERT:
    expect(() => makeAskQuestionNode()(stateWithoutQuiz, {} as never)).toThrow(
      "Missing required state property: quiz",
    );
  });

  it("re-interrupts if the answer schema is invalid, with a reason", () => {
    // ARRANGE:
    const seen = scriptInterrupt([
      { invalid: "schema" }, // invalid for question 1 (single)
      { selections: [0] }, // valid for question 1
      { selections: [0, 1] }, // valid for question 2 (multi)
      { selections: [2] }, // valid for question 3 (single)
      { selections: [1, 3] }, // valid for question 4 (multi)
      { selections: [3] }, // valid for question 5 (single)
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({
      answers: [[0], [0, 1], [2], [1, 3], [3]],
    });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    // The first ask carries no reason; the re-ask of the same question does.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[0].reason).toBeUndefined();
    expect(payloads[1].index).toBe(0);
    expect(payloads[1].reason).toContain(
      "Invalid input: expected array, received undefined",
    );
  });

  it("re-interrupts if a single question has more than 1 answers, with a reason", () => {
    // ARRANGE:
    const seen = scriptInterrupt([
      { selections: [1, 2] }, // invalid for question 1 (single)
      { selections: [0] }, // valid for question 1
      { selections: [0, 1] }, // valid for question 2 (multi)
      { selections: [2] }, // valid for question 3 (single)
      { selections: [1, 3] }, // valid for question 4 (multi)
      { selections: [3] }, // valid for question 5 (single)
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({
      answers: [[0], [0, 1], [2], [1, 3], [3]],
    });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    // The first ask carries no reason; the re-ask of the same question does.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[0].reason).toBeUndefined();
    expect(payloads[1].index).toBe(0);
    expect(payloads[1].reason).toContain("Select exactly one option.");
  });

  it("re-interrupts if duplicate answers have been provided", () => {
    // ARRANGE:
    const seen = scriptInterrupt([
      { selections: [0] }, // valid for question 1
      { selections: [1, 1] }, // invalid for question 2 (multi)
      { selections: [1, 2] }, // valid for question 2 (multi)
      { selections: [2] }, // valid for question 3 (single)
      { selections: [1, 3] }, // valid for question 4 (multi)
      { selections: [3] }, // valid for question 5 (single)
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({
      answers: [[0], [1, 2], [2], [1, 3], [3]],
    });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    // Question 2's first ask carries no reason; its re-ask does.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[1].reason).toBeUndefined();
    expect(payloads[2].index).toBe(1);
    expect(payloads[2].reason).toContain("Selections must be unique");
  });

  it("throws if the interrupt mock runs out of scripted resumes", () => {
    // ARRANGE:
    scriptInterrupt([{ selections: [0] }]); // only one resume scripted

    // ACT & ASSERT:
    expect(() => makeAskQuestionNode()(state, {} as never)).toThrow(
      "script exhausted: the node would pause here",
    );
  });
});
