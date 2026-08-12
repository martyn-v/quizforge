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
import { makeLoadQuizNode } from "./nodes/load-quiz";
import { QuizState } from "./state";
import { makePersistQuizNode } from "./nodes/persist-quiz";
import { PrismaClient } from "../generated/prisma/client";
import { makeScoreAnswersNode } from "./nodes/score-answers";
import { ScoringService } from "../scoring/scoring.service";
import type { QuizGenerationStrategy } from "./strategies/generation-strategy";

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
 *
 * The loadQuiz node serves a stored quiz for a known source url and skips
 * generation.
 */
export function buildQuizGraph(
  llm: BaseChatModel,
  checkpointer: BaseCheckpointSaver,
  prisma: PrismaClient,
  scoringService: ScoringService,
  quizMeta: { model: string; strategy: string },
  generationStrategy?: QuizGenerationStrategy,
) {
  return new StateGraph(QuizState)
    .addNode("fetchSource", makeFetchSourceNode())
    .addNode("loadQuiz", makeLoadQuizNode(prisma))
    .addNode("generateQuestions", makeGenerateQuestionsNode(llm, generationStrategy))
    .addNode("persistQuiz", makePersistQuizNode(prisma, quizMeta))
    .addNode("askQuestion", makeAskQuestionNode())
    .addNode("scoreAnswers", makeScoreAnswersNode(scoringService))
    .addNode("finalize", makeFinalizeNode(prisma))
    .addEdge(START, "fetchSource")
    .addEdge("fetchSource", "loadQuiz")
    // The branch: a stored quiz goes straight to the questions, a miss
    // generates and persists a new quiz first.
    .addConditionalEdges(
      "loadQuiz",
      (state) => (state.quiz ? "askQuestion" : "generateQuestions"),
      ["askQuestion", "generateQuestions"],
    )
    .addEdge("generateQuestions", "persistQuiz")
    .addEdge("persistQuiz", "askQuestion")
    .addEdge("askQuestion", "scoreAnswers")
    .addEdge("scoreAnswers", "finalize")
    .addEdge("finalize", END)
    .compile({ checkpointer });
}

export type QuizGraph = ReturnType<typeof buildQuizGraph>;
