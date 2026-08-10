import { DraftQuizSchema, structuralFailures } from "./quiz-shape.ts";
import type { DraftQuestion, DraftQuiz } from "./quiz-shape.ts";

function makeQuestion(overrides: Partial<DraftQuestion> = {}): DraftQuestion {
  return {
    text: "What does leftPad do?",
    type: "single",
    options: [
      { text: "Pads a string on the left", isCorrect: true },
      { text: "Pads a string on the right", isCorrect: false },
      { text: "Trims a string", isCorrect: false },
      { text: "Reverses a string", isCorrect: false },
    ],
    ...overrides,
  };
}

function makeMultiQuestion(): DraftQuestion {
  return makeQuestion({
    type: "multi",
    options: [
      { text: "Pads a string on the left", isCorrect: true },
      { text: "Accepts a pad length", isCorrect: true },
      { text: "Trims a string", isCorrect: false },
      { text: "Reverses a string", isCorrect: false },
    ],
  });
}

// The last question is multi, so the quiz has a mix of both types.
function makeQuiz(questionCount = 5): DraftQuiz {
  return {
    title: "left-pad quiz",
    questions: Array.from({ length: questionCount }, (_, index) =>
      index === questionCount - 1 ? makeMultiQuestion() : makeQuestion(),
    ),
  };
}

describe("DraftQuizSchema", () => {
  it("accepts a well-formed quiz", () => {
    expect(DraftQuizSchema.safeParse(makeQuiz()).success).toBe(true);
  });

  it("rejects a quiz without questions", () => {
    const parsed = DraftQuizSchema.safeParse({ title: "t" });
    expect(parsed.success).toBe(false);
  });
});

describe("structuralFailures", () => {
  it("returns no failures for a valid quiz", () => {
    expect(structuralFailures(makeQuiz(5))).toEqual([]);
    expect(structuralFailures(makeQuiz(8))).toEqual([]);
  });

  it("flags a quiz with fewer than 5 or more than 8 questions", () => {
    expect(structuralFailures(makeQuiz(4))).toContain(
      "quiz has 4 questions, expected 5 to 8",
    );
    expect(structuralFailures(makeQuiz(9))).toContain(
      "quiz has 9 questions, expected 5 to 8",
    );
  });

  it("flags a question without exactly 4 options", () => {
    const bad = makeQuestion();
    bad.options = bad.options.slice(0, 3);
    const quiz = makeQuiz(5);
    quiz.questions[2] = bad;
    expect(structuralFailures(quiz)).toContain(
      "question 3 has 3 options, expected 4",
    );
  });

  it("flags a single-answer question without exactly one correct option", () => {
    const bad = makeQuestion();
    bad.options[1].isCorrect = true;
    const quiz = makeQuiz(5);
    quiz.questions[0] = bad;
    expect(structuralFailures(quiz)).toContain(
      "question 1 is single-answer with 2 correct options, expected 1",
    );
  });

  it("flags a quiz with no multi-answer question", () => {
    const quiz = makeQuiz(5);
    quiz.questions = quiz.questions.map(() => makeQuestion());
    expect(structuralFailures(quiz)).toContain(
      "quiz has no multi-answer question",
    );
  });

  it("flags a quiz with no single-answer question", () => {
    const quiz = makeQuiz(5);
    quiz.questions = quiz.questions.map(() => makeMultiQuestion());
    expect(structuralFailures(quiz)).toContain(
      "quiz has no single-answer question",
    );
  });

  it("flags a multi-answer question with fewer than 2 correct options", () => {
    const bad = makeQuestion({ type: "multi" });
    const quiz = makeQuiz(5);
    quiz.questions[4] = bad;
    expect(structuralFailures(quiz)).toContain(
      "question 5 is multi-answer with 1 correct option, expected 2 or more",
    );
  });
});
