import { StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";

const QuizState = new StateSchema({
  readme_url: z.string().describe("The URL of the README file for the quiz"),
  source: z
    .string()
    .default("")
    .describe("The Markdown that fetchSource retrieved from readme_url"),
});

export { QuizState };
