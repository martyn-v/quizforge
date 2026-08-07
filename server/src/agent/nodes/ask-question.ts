import { GraphNode, interrupt } from "@langchain/langgraph";
import { InvalidStateError } from "../../common/errors";
import { QuizState } from "../state";
import { AskQuestionPayloadSchema, ResumeSchema } from "../agent.schemas";
import { z } from "zod/v4";

export function makeAskQuestionNode(): GraphNode<typeof QuizState> {
  return (state) => {
    if (!state.quiz) {
      throw new InvalidStateError("Missing required state property: quiz");
    }

    const answers = [];

    for (let i = 0; i < state.quiz.questions.length; i++) {
      const question = state.quiz.questions[i];

      const payload: z.infer<typeof AskQuestionPayloadSchema> = {
        question: {
          ...question,
          options: question.options.map(({ text }) => ({ text })), // Strip the isCorrect field from the options
        },
        index: i,
        total: state.quiz.questions.length,
      };

      while (true) {
        const raw: unknown = interrupt(payload);
        const parsed = ResumeSchema.safeParse(raw);
        if (!parsed.success) {
          payload.reason = `Invalid response: ${z.prettifyError(parsed.error)}`;
          continue;
        }

        if (question.type === "single" && parsed.data.selections.length !== 1) {
          payload.reason = "Select exactly one option.";
          continue;
        }

        answers.push(parsed.data.selections);
        break;
      }
    }

    return { answers };
  };
}
