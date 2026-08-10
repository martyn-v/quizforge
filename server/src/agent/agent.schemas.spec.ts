import { GeneratedQuizSchema } from "./agent.schemas";
import { makeDraft } from "./quiz-fixtures";

/** Returns a valid draft with question 2 (multi) given n correct options. */
function draftWithMultiCorrectCount(n: number) {
  const draft = makeDraft();
  const multi = draft.questions[1];
  multi.options = multi.options.map((o, i) => ({ ...o, isCorrect: i < n }));
  return draft;
}

describe("GeneratedQuizSchema", () => {
  it("accepts the valid fixture draft", () => {
    expect(GeneratedQuizSchema.safeParse(makeDraft()).success).toBe(true);
  });

  describe("multi-answer cardinality", () => {
    it.each([2, 3])("accepts a multi question with %i correct options", (n) => {
      const result = GeneratedQuizSchema.safeParse(
        draftWithMultiCorrectCount(n),
      );
      expect(result.success).toBe(true);
    });

    it.each([0, 1, 4])(
      "rejects a multi question with %i correct options",
      (n) => {
        const result = GeneratedQuizSchema.safeParse(
          draftWithMultiCorrectCount(n),
        );
        expect(result.success).toBe(false);
      },
    );
  });
});
