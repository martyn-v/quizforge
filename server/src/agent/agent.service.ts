import { BaseCheckpointSaver, StateGraph } from "@langchain/langgraph";
import { Injectable, OnModuleInit, Inject } from "@nestjs/common";
import { LLM_PROVIDER } from "./llm.provider";
import { CHECKPOINTER } from "./checkpointer.provider";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { QuizState } from "./state";

// Module level and deliberately unannotated. Every addNode widens the node-name
// type parameter, so the compiled graph's type changes shape as the graph grows;
// restating it by hand goes stale on the next node. Inference tracks it, and the
// typed resume value from interrupt() flows through the same parameters.
function buildQuizGraph(
  _llm: BaseChatModel,
  checkpointer: BaseCheckpointSaver,
) {
  return new StateGraph(QuizState).compile({ checkpointer });
}

type QuizGraph = ReturnType<typeof buildQuizGraph>;

@Injectable()
export class AgentService implements OnModuleInit {
  private graph!: QuizGraph;

  constructor(
    @Inject(CHECKPOINTER) private readonly checkpointer: BaseCheckpointSaver,
    @Inject(LLM_PROVIDER) private llm: BaseChatModel,
  ) {}

  async onModuleInit() {
    this.graph = buildQuizGraph(this.llm, this.checkpointer);
  }
}
