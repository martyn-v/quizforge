import type { QuestionType } from "@quizforge/shared";

/**
 * The only translation between the domain spelling ("single") and the
 * Prisma enum spelling ("SINGLE"). Only code that touches Prisma
 * imports this module.
 */

const TO_DB = { single: "SINGLE", multi: "MULTI" } as const;

export type DbQuestionType = (typeof TO_DB)[QuestionType];

const FROM_DB = { SINGLE: "single", MULTI: "multi" } as const satisfies Record<
  DbQuestionType,
  QuestionType
>;

export function toDbQuestionType(type: QuestionType): DbQuestionType {
  return TO_DB[type];
}

export function fromDbQuestionType(type: DbQuestionType): QuestionType {
  return FROM_DB[type];
}
