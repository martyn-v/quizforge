import { z } from "zod/v4";
import {
  DraftOptionSchema,
  DraftQuestionSchema,
  DraftQuizSchema,
} from "@quizforge/shared";

/**
 * The generation contract for the LLM. The draft shapes come from
 * shared; this schema adds the size bounds the generator must meet.
 * The interrupt and resume schemas live in shared.
 */
export const GeneratedQuizSchema = DraftQuizSchema.extend({
  questions: z
    .array(
      DraftQuestionSchema.extend({
        options: z
          .array(DraftOptionSchema)
          .min(4)
          .max(4)
          .describe("The options for the question"),
      }),
    )
    .min(5)
    .max(8)
    .describe("The questions in the quiz"),
});
