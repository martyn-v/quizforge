import { GraphNode, interrupt } from "@langchain/langgraph";
import {
  ResumeSchema,
  type Answers,
  type AskQuestionPayload,
} from "@quizforge/shared";
import { z } from "zod/v4";
import { InvalidStateError } from "../../common/errors";
import { QuizState } from "../state";

export function makeAskQuestionNode(): GraphNode<typeof QuizState> {
  return (state) => {
    if (!state.quiz) {
      throw new InvalidStateError("Missing required state property: quiz");
    }

    const answers: Answers = {};

    for (let i = 0; i < state.quiz.questions.length; i++) {
      const question = state.quiz.questions[i];
      const validIds = new Set(question.options.map((o) => o.id));

      const payload: AskQuestionPayload = {
        question: {
          id: question.id,
          text: question.text,
          type: question.type,
          // Strip the isCorrect field from the options
          options: question.options.map(({ id, text }) => ({ id, text })),
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

        const { selections } = parsed.data;

        // Membership stays an inline lookup: ScoringService also checks
        // it, but the service throws and this loop must never throw. A
        // stale submit for another question fails here and re-prompts.
        if (!selections.every((id) => validIds.has(id))) {
          payload.reason = "Unknown option id for this question.";
          continue;
        }

        if (question.type === "single" && selections.length !== 1) {
          payload.reason = "Select exactly one option.";
          continue;
        }

        answers[question.id] = selections;
        break;
      }
    }

    return { answers };
  };
}
