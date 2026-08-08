import {
  BaseCheckpointSaver,
  INTERRUPT,
  isInterrupted,
  Command,
} from "@langchain/langgraph";
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from "@nestjs/common";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { InvalidStateError } from "../common/errors";
import { buildQuizGraph, type QuizGraph } from "./graph";
import { CHECKPOINTER } from "./providers/checkpointer.provider";
import { LLM_PROVIDER } from "./providers/llm.provider";
import {
  GENERATION_STRATEGY_PROVIDER,
  GenerationStrategy,
} from "./providers/generation-strategy.provider";
import { PrismaClient } from "../generated/prisma/client";
import { PRISMA } from "./providers/prisma.provider";
import { ScoringService } from "../scoring/scoring.service";
import {
  AskQuestionPayloadSchema,
  QuizResultSchema,
  StartSessionResponse,
  SubmitAnswerResponse,
} from "@quizforge/shared";

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
    private readonly scoringService: ScoringService,
  ) {}

  onModuleInit() {
    this.graph = buildQuizGraph(
      this.llm,
      this.checkpointer,
      this.prisma,
      this.scoringService,
    );
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  async startSession(url: string): Promise<StartSessionResponse> {
    const sessionId = crypto.randomUUID();

    const result = await this.graph.invoke(
      { readme_url: url },
      { configurable: { thread_id: sessionId } },
    );

    if (!isInterrupted(result)) {
      throw new InvalidStateError(
        "Expected the graph to be interrupted after starting a session",
      );
    }

    const interrupt = result[INTERRUPT][0].value;

    return { sessionId, question: AskQuestionPayloadSchema.parse(interrupt) };
  }

  async submitAnswer(
    sessionId: string,
    selections: string[],
  ): Promise<SubmitAnswerResponse> {
    // FIXME: handle invalid sessionId (e.g. expired, or never existed). The graph will throw an error if the thread_id is unknown, but we should catch that and return a 404 instead of a 500.
    const result = await this.graph.invoke(
      new Command({ resume: { selections } }),
      {
        configurable: { thread_id: sessionId },
      },
    );

    if (isInterrupted(result)) {
      const interrupt = result[INTERRUPT][0].value;
      return {
        kind: "question",
        question: AskQuestionPayloadSchema.parse(interrupt),
      };
    } else {
      return {
        kind: "result",
        result: QuizResultSchema.parse({
          finalScore: result.finalScore,
          scores: result.scores,
          attemptId: result.attemptId,
        }),
      };
    }
  }
}
