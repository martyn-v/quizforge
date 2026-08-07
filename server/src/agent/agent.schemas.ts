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

const PublicOptionSchema = OptionSchema.omit({ isCorrect: true });
export const AskQuestionPayloadSchema = z.object({
  question: QuestionSchema.extend({
    options: z.array(PublicOptionSchema).min(4).max(4),
  }),
  index: z.int(),
  total: z.int(),
  reason: z.string().optional(), // Set on re-prompt the same question
});

export const ResumeSchema = z.object({
  selections: z
    .array(z.int().min(0).max(3))
    .min(1)
    .max(4)
    .refine((s) => new Set(s).size === s.length, "Selections must be unique")
    .describe("The selected option indices for one question"),
});
