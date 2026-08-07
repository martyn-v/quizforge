import { BaseCheckpointSaver } from "@langchain/langgraph";
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from "@nestjs/common";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildQuizGraph, type QuizGraph } from "./graph";
import { CHECKPOINTER } from "./providers/checkpointer.provider";
import { LLM_PROVIDER } from "./providers/llm.provider";
import {
  GENERATION_STRATEGY_PROVIDER,
  GenerationStrategy,
} from "./providers/generation-strategy.provider";
import { PrismaClient } from "../generated/prisma/client";
import { PRISMA } from "./providers/prisma.provider";

/** Compiles the graph once at startup and holds it. */
@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private graph!: QuizGraph;

  constructor(
    @Inject(CHECKPOINTER) private readonly checkpointer: BaseCheckpointSaver,
    @Inject(LLM_PROVIDER) private llm: BaseChatModel,
    @Inject(GENERATION_STRATEGY_PROVIDER)
    private _generationStrategy: GenerationStrategy,
    @Inject(PRISMA) private prisma: PrismaClient,
  ) {}

  onModuleInit() {
    this.graph = buildQuizGraph(this.llm, this.checkpointer, this.prisma);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
