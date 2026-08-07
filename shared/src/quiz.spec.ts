import { describe, expect, it } from "vitest";
import {
  AnswersSchema,
  DraftQuizSchema,
  PublicQuestionSchema,
  QuizSchema,
  ResumeSchema,
} from "./quiz.js";

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
