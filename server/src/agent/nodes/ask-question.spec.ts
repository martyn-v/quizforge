import { interrupt } from "@langchain/langgraph";
import { AskQuestionPayloadSchema } from "@quizforge/shared";
import { QuizState } from "../state";
import { makeQuiz, oid, qid } from "../quiz-fixtures";
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

const QUIZ_ID = "412438f7-b949-41d0-aaae-6387d5bc9291";

// One valid selection per question: any option for a single question,
// any two options for a multi question. Correctness is not relevant
// here; this node only collects.
const validResumes = [
  { selections: [oid(0, 0)] },
  { selections: [oid(1, 0), oid(1, 1)] },
  { selections: [oid(2, 2)] },
  { selections: [oid(3, 1), oid(3, 3)] },
  { selections: [oid(4, 3)] },
];

const validAnswers = {
  [qid(0)]: [oid(0, 0)],
  [qid(1)]: [oid(1, 0), oid(1, 1)],
  [qid(2)]: [oid(2, 2)],
  [qid(3)]: [oid(3, 1), oid(3, 3)],
  [qid(4)]: [oid(4, 3)],
};

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  draft: undefined,
  generationRetries: undefined,
  quiz: makeQuiz(QUIZ_ID),
  startedAt: undefined,
  answers: {},
  scores: {},
  finalScore: undefined,
  attemptId: undefined,
};

describe("askQuestionNode", () => {
  it("collects one answer per question, keyed by question id", () => {
    // ARRANGE:
    const seen = scriptInterrupt([...validResumes]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(5);

    // Observe the payloads: question order, ids present, no isCorrect.
    // Parsing doubles as an assertion that every payload matches the schema.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
    expect(payloads.map((p) => p.question.id)).toEqual(
      [0, 1, 2, 3, 4].map(qid),
    );
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
    // ARRANGE: option indices are the old wire contract and fail the
    // uuid schema; the node must re-prompt, never throw.
    const seen = scriptInterrupt([
      { selections: [0] }, // invalid: a number is not an option id
      ...validResumes,
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    // The first ask carries no reason; the re-ask of the same question does.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[0].reason).toBeUndefined();
    expect(payloads[1].index).toBe(0);
    expect(payloads[1].reason).toContain("Invalid response:");
  });

  it("re-interrupts on an option id from another question, with a reason", () => {
    // ARRANGE: a well-formed uuid that belongs to question 2, offered
    // as an answer to question 1.
    const seen = scriptInterrupt([
      { selections: [oid(1, 0)] },
      ...validResumes,
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[1].index).toBe(0);
    expect(payloads[1].reason).toBe("Unknown option id for this question.");
  });

  it("re-interrupts if a single question gets more than 1 answer, with a reason", () => {
    // ARRANGE:
    const seen = scriptInterrupt([
      { selections: [oid(0, 0), oid(0, 1)] }, // invalid: question 1 is single
      ...validResumes,
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[0].reason).toBeUndefined();
    expect(payloads[1].index).toBe(0);
    expect(payloads[1].reason).toContain("Select exactly one option.");
  });

  it("re-interrupts if duplicate selections have been provided", () => {
    // ARRANGE:
    const seen = scriptInterrupt([
      { selections: [oid(0, 0)] }, // valid for question 1
      { selections: [oid(1, 1), oid(1, 1)] }, // invalid: duplicate id
      { selections: [oid(1, 0), oid(1, 1)] }, // valid for question 2
      ...validResumes.slice(2),
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    // Question 2's first ask carries no reason; its re-ask does.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[1].reason).toBeUndefined();
    expect(payloads[2].index).toBe(1);
    expect(payloads[2].reason).toContain("Selections must be unique");
  });

  it("throws if the interrupt mock runs out of scripted resumes", () => {
    // ARRANGE:
    scriptInterrupt([{ selections: [oid(0, 0)] }]); // only one resume scripted

    // ACT & ASSERT:
    expect(() => makeAskQuestionNode()(state, {} as never)).toThrow(
      "script exhausted: the node would pause here",
    );
  });
});
