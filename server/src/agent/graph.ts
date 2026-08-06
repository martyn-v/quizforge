import {
  BaseCheckpointSaver,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { makeFetchSourceNode } from "./nodes/fetch-source";
import { QuizState } from "./state";

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
  _llm: BaseChatModel,
  checkpointer: BaseCheckpointSaver,
) {
  return new StateGraph(QuizState)
    .addNode("fetchSource", makeFetchSourceNode())
    .addEdge(START, "fetchSource")
    .addEdge("fetchSource", END)
    .compile({ checkpointer });
}

export type QuizGraph = ReturnType<typeof buildQuizGraph>;
