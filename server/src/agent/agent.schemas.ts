import { z } from "zod/v4";

export const OptionSchema = z.object({
  text: z.string().describe("The text of the option"),
  isCorrect: z.boolean().describe("Whether the option is correct"),
});

export const QuestionSchema = z.object({
  text: z.string().describe("The text of the question"),
  type: z.enum(["single", "multi"]).describe("The type of the question"),
  options: z
    .array(OptionSchema)
    .min(4)
    .max(4)
    .describe("The options for the question"),
});

export const QuizSchema = z.object({
  title: z.string().describe("The title of the quiz"),
  description: z.string().optional().describe("The description of the quiz"),
  questions: z
    .array(QuestionSchema)
    .min(5)
    .max(8)
    .describe("The questions in the quiz"),
});
