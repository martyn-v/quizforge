import { describe, expect, it } from "vitest";
import {
  AnswersSchema,
  DraftQuizSchema,
  PublicQuestionSchema,
  QuizSchema,
  ResumeSchema,
  StartSessionRequestSchema,
  SubmitAnswerRequestSchema,
} from "./quiz";

const OPTION_ID = "00000000-0000-4000-8000-200000000000";
const OPTION_ID_2 = "00000000-0000-4000-8000-200000000001";
const QUESTION_ID = "00000000-0000-4000-8000-100000000000";
const QUIZ_ID = "00000000-0000-4000-8000-000000000000";

const draft = {
  title: "t",
  questions: [
    {
      text: "q",
      type: "single",
      // Three options on purpose: the draft shapes carry no size bounds.
      options: [
        { text: "a", isCorrect: true },
        { text: "b", isCorrect: false },
        { text: "c", isCorrect: false },
      ],
    },
  ],
};

describe("DraftQuizSchema", () => {
  it("accepts a draft without ids and without size bounds", () => {
    expect(DraftQuizSchema.safeParse(draft).success).toBe(true);
  });
});

describe("QuizSchema", () => {
  it("rejects a draft, because the canonical quiz requires ids", () => {
    expect(QuizSchema.safeParse(draft).success).toBe(false);
  });

  it("accepts a quiz with uuids on every level", () => {
    const quiz = {
      id: QUIZ_ID,
      title: "t",
      questions: [
        {
          id: QUESTION_ID,
          text: "q",
          type: "multi",
          options: [
            { id: OPTION_ID, text: "a", isCorrect: true },
            { id: OPTION_ID_2, text: "b", isCorrect: true },
          ],
        },
      ],
    };
    expect(QuizSchema.safeParse(quiz).success).toBe(true);
  });
});

describe("PublicQuestionSchema", () => {
  it("strips isCorrect on parse", () => {
    const parsed = PublicQuestionSchema.parse({
      id: QUESTION_ID,
      text: "q",
      type: "single",
      options: [{ id: OPTION_ID, text: "a", isCorrect: true }],
    });
    expect(JSON.stringify(parsed)).not.toContain("isCorrect");
  });
});

describe("ResumeSchema", () => {
  it("accepts 1 to 4 unique option ids", () => {
    const parsed = ResumeSchema.safeParse({
      selections: [OPTION_ID, OPTION_ID_2],
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    { label: "an empty selection", selections: [] },
    { label: "a duplicate id", selections: [OPTION_ID, OPTION_ID] },
    { label: "a non-uuid string", selections: ["2"] },
    { label: "a number", selections: [2] },
  ])("rejects $label", ({ selections }) => {
    expect(ResumeSchema.safeParse({ selections }).success).toBe(false);
  });
});

describe("StartSessionRequestSchema", () => {
  it("accepts a body with a url", () => {
    const parsed = StartSessionRequestSchema.safeParse({
      url: "https://github.com/o/r/blob/main/README.md",
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    { label: "a missing url", body: {} },
    { label: "a non-url string", body: { url: "not a url" } },
  ])("rejects $label", ({ body }) => {
    expect(StartSessionRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("SubmitAnswerRequestSchema", () => {
  // The schema checks shape only. Semantic checks (uuid, cardinality,
  // membership) live in the interrupt loop, which re-prompts instead of
  // rejecting, so a stale client sees a reason and not a 400.
  it("accepts any array of strings as selections", () => {
    const parsed = SubmitAnswerRequestSchema.safeParse({
      selections: ["not-a-uuid"],
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    { label: "a missing selections field", body: {} },
    { label: "a number in selections", body: { selections: [2] } },
    { label: "a bare string", body: { selections: "abc" } },
  ])("rejects $label", ({ body }) => {
    expect(SubmitAnswerRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("AnswersSchema", () => {
  it("accepts a record from question id to option ids", () => {
    const parsed = AnswersSchema.safeParse({
      [QUESTION_ID]: [OPTION_ID, OPTION_ID_2],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid key", () => {
    expect(AnswersSchema.safeParse({ "0": [OPTION_ID] }).success).toBe(false);
  });
});
