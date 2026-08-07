import { z } from "zod/v4";

export const QuizSchema = z.object({
  title: z.string().describe("The title of the quiz"),
  description: z.string().optional().describe("The description of the quiz"),
});
