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
import { InvalidStateError, SessionNotFoundError } from "../common/errors";
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
import { LLM_MODEL_NAME } from "./providers/llm-model-name.provider";

/** Compiles the graph once at startup and holds it. */
@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private graph!: QuizGraph;

  constructor(
    @Inject(CHECKPOINTER) private readonly checkpointer: BaseCheckpointSaver,
    @Inject(LLM_PROVIDER) private llm: BaseChatModel,
    @Inject(GENERATION_STRATEGY_PROVIDER)
    private generationStrategy: GenerationStrategy,
    @Inject(LLM_MODEL_NAME) private llmModelName: string,
    @Inject(PRISMA) private prisma: PrismaClient,
    private readonly scoringService: ScoringService,
  ) {}

  onModuleInit() {
    this.graph = buildQuizGraph(
      this.llm,
      this.checkpointer,
      this.prisma,
      this.scoringService,
      {
        model: this.llmModelName,
        strategy: this.generationStrategy,
      },
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
    await this.requireSession(sessionId);

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

  async getSession(sessionId: string): Promise<SubmitAnswerResponse> {
    const snapshot = await this.requireSession(sessionId);

    const interrupt = snapshot.tasks.flatMap((task) => task.interrupts)[0];
    if (interrupt !== undefined) {
      return {
        kind: "question",
        question: AskQuestionPayloadSchema.parse(interrupt.value),
      };
    }

    // getState types values as any; the schema parse restores safety.
    const values = snapshot.values as Record<string, unknown>;

    if (values.finalScore === undefined) {
      throw new InvalidStateError(
        `Session ${sessionId} is neither paused at a question nor completed`,
      );
    }

    return {
      kind: "result",
      result: QuizResultSchema.parse({
        finalScore: values.finalScore,
        scores: values.scores,
        attemptId: values.attemptId,
      }),
    };
  }

  /**
   * Reads the thread snapshot and throws when no checkpoint exists.
   * getState only sets createdAt when it found a saved checkpoint.
   */
  private async requireSession(sessionId: string) {
    const snapshot = await this.graph.getState({
      configurable: { thread_id: sessionId },
    });

    if (snapshot.createdAt === undefined) {
      throw new SessionNotFoundError(`Unknown session: ${sessionId}`);
    }

    return snapshot;
  }
}
