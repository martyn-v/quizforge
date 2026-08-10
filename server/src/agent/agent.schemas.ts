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
      }).refine(
        (q) => {
          if (q.type !== "multi") {
            return true;
          }
          const correct = q.options.filter((o) => o.isCorrect).length;
          return correct === 2 || correct === 3;
        },
        { message: "A multi question must have 2 or 3 correct options" },
      ),
    )
    .min(5)
    .max(8)
    .describe("The questions in the quiz"),
});
