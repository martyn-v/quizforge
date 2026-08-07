import {
  BaseCheckpointSaver,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { makeAskQuestionNode } from "./nodes/ask-question";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { makeFinalizeNode } from "./nodes/finalize";

import { makeFetchSourceNode } from "./nodes/fetch-source";
import { makeGenerateQuestionsNode } from "./nodes/generate-questions";
import { QuizState } from "./state";
import { makePersistQuizNode } from "./nodes/persist-quiz";
import { PrismaClient } from "../generated/prisma/client";
import { makeScoreAnswersNode } from "./nodes/score-answers";
import { ScoringService } from "../scoring/scoring.service";

/**
 * Builds and compiles the quiz graph.
 *
 * The return type is deliberately not annotated. Every addNode widens the
 * node-name type parameter, so the type of the compiled graph changes as the
 * graph grows. A written annotation is out of date after the next node.
 * Inference follows it, and the typed resume value of interrupt() comes
 * through the same parameters.
 *
 * The dependencies are parameters and not injected, so a test builds the
 * same graph with a fake model and a MemorySaver.
 */
export function buildQuizGraph(
  llm: BaseChatModel,
  checkpointer: BaseCheckpointSaver,
  prisma: PrismaClient,
  scoringService: ScoringService,
) {
  return new StateGraph(QuizState)
    .addNode("fetchSource", makeFetchSourceNode())
    .addNode("generateQuestions", makeGenerateQuestionsNode(llm))
    .addNode("persistQuiz", makePersistQuizNode(prisma))
    .addNode("askQuestion", makeAskQuestionNode())
    .addNode("scoreAnswers", makeScoreAnswersNode(scoringService))
    .addNode("finalize", makeFinalizeNode(prisma))
    .addEdge(START, "fetchSource")
    .addEdge("fetchSource", "generateQuestions")
    .addEdge("generateQuestions", "persistQuiz")
    .addEdge("persistQuiz", "askQuestion")
    .addEdge("askQuestion", "scoreAnswers")
    .addEdge("scoreAnswers", "finalize")
    .addEdge("finalize", END)
    .compile({ checkpointer });
}

export type QuizGraph = ReturnType<typeof buildQuizGraph>;
