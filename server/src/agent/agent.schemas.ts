import { z } from "zod/v4";
import {
  DraftOptionSchema,
  DraftQuestionSchema,
  DraftQuizSchema,
} from "@quizforge/shared";

/**
 * The generation contract for the LLM. The draft shapes come from
 * shared; these schemas add the size bounds the generator must meet.
 * The interrupt and resume schemas live in shared.
 */
const GeneratedQuestionSchema = DraftQuestionSchema.extend({
  options: z
    .array(DraftOptionSchema)
    .min(4)
    .max(4)
    .describe("The options for the question"),
}).refine(
  (q) => {
    if (q.type !== "multi") {
      return true;
    }
    const correct = q.options.filter((o) => o.isCorrect).length;
    return correct === 2 || correct === 3;
  },
  { message: "A multi question must have 2 or 3 correct options" },
);

/** The whole-quiz contract: 5 to 8 questions for one document. */
export const GeneratedQuizSchema = DraftQuizSchema.extend({
  questions: z
    .array(GeneratedQuestionSchema)
    .min(5)
    .max(8)
    .describe("The questions in the quiz"),
});

/**
 * The per-section contract for the chunked strategy. One section is too
 * small for a whole quiz, so the bound relaxes to 1 to 4 questions. The
 * strategy applies the 5-to-8 whole-quiz bound after it merges the
 * sections.
 */
export const ChunkQuizSchema = DraftQuizSchema.extend({
  questions: z
    .array(GeneratedQuestionSchema)
    .min(1)
    .max(4)
    .describe("The questions for this section"),
});
