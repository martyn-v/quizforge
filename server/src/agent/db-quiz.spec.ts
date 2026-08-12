import { toQuiz } from "./db-quiz";
import { makeDbQuiz, makeQuiz } from "./quiz-fixtures";

describe("toQuiz", () => {
  it("maps a database row with nested questions and options to a Quiz", () => {
    const quizId = crypto.randomUUID();

    expect(toQuiz(makeDbQuiz(quizId))).toEqual(makeQuiz(quizId));
  });

  it("maps a null description to undefined", () => {
    const row = { ...makeDbQuiz(crypto.randomUUID()), description: null };

    expect(toQuiz(row).description).toBeUndefined();
  });
});
