import { fromDbQuestionType, toDbQuestionType } from "./question-type-map";

describe("question-type-map", () => {
  it.each([
    { domain: "single", db: "SINGLE" },
    { domain: "multi", db: "MULTI" },
  ] as const)("round-trips $domain", ({ domain, db }) => {
    expect(toDbQuestionType(domain)).toBe(db);
    expect(fromDbQuestionType(db)).toBe(domain);
  });
});
