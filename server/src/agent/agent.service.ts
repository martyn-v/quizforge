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
import { GENERATION_STRATEGY_PROVIDER } from "./providers/generation-strategy.provider";
import type { QuizGenerationStrategy } from "./strategies/generation-strategy";
import { PrismaClient } from "../generated/prisma/client";
import { PRISMA } from "./providers/prisma.provider";
import { ScoringService } from "../scoring/scoring.service";
import {
  AskQuestionPayloadSchema,
  QuizResultSchema,
  StartSessionResponse,
  StreamEvent,
  SubmitAnswerResponse,
} from "@quizforge/shared";
import { LLM_MODEL_NAME } from "./providers/llm-model-name.provider";

/**
 * Service responsible for managing quiz sessions.
 *
 * It provides methods to start a new session, submit answers, and retrieve the current state of a session.
 * The service interacts with the underlying quiz graph and handles session state management.
 */
@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private graph!: QuizGraph;

  constructor(
    @Inject(CHECKPOINTER) private readonly checkpointer: BaseCheckpointSaver,
    @Inject(LLM_PROVIDER) private llm: BaseChatModel,
    @Inject(GENERATION_STRATEGY_PROVIDER)
    private generationStrategy: QuizGenerationStrategy,
    @Inject(LLM_MODEL_NAME) private llmModelName: string,
    @Inject(PRISMA) private prisma: PrismaClient,
    private readonly scoringService: ScoringService,
  ) {}

  /**
   * Initializes the quiz graph when the module is initialized.
   * This method is called automatically by the NestJS framework when the module is initialized.
   * It builds the quiz graph using the provided LLM, checkpointer, Prisma client, scoring service, and generation strategy.
   * The graph is stored in the `graph` property for later use in session management.
   * @returns void
   */
  onModuleInit() {
    this.graph = buildQuizGraph(
      this.llm,
      this.checkpointer,
      this.prisma,
      this.scoringService,
      {
        model: this.llmModelName,
        strategy: this.generationStrategy.name,
      },
      this.generationStrategy,
    );
  }

  /**
   * Disconnects the Prisma client when the module is destroyed.
   * This method is called automatically by the NestJS framework when the module is destroyed.
   * It ensures that the Prisma client is properly disconnected to free up resources.
   * @returns void
   */
  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  /**
   * Starts a new quiz session with the provided URL.
   * @param url - The URL to start the session with.
   * @returns A promise that resolves to the StartSessionResponse containing the session ID and the first question.
   */
  async startSession(url: string): Promise<StartSessionResponse> {
    const sessionId = crypto.randomUUID();

    const result = await this.graph.invoke(
      { readme_url: url },
      {
        configurable: { thread_id: sessionId },
        // The metadata lands on the LangSmith trace of the run.
        metadata: {
          strategy: this.generationStrategy.name,
          model: this.llmModelName,
        },
      },
    );

    if (!isInterrupted(result)) {
      throw new InvalidStateError(
        "Expected the graph to be interrupted after starting a session",
      );
    }

    const interrupt = result[INTERRUPT][0].value;

    return { sessionId, question: AskQuestionPayloadSchema.parse(interrupt) };
  }

  /**
   * Starts a new quiz session with the provided URL and streams the events as they occur.
   *
   * This method returns an async generator that yields StreamEvent objects representing the progress and questions of the session.
   * The session ID is generated randomly and used to track the session state.
   * @param url - The URL to start the session with.
   * @returns An async generator that yields StreamEvent objects.
   * @throws InvalidStateError if the graph does not interrupt as expected after starting a session.
   */
  async *startSessionStream(url: string): AsyncGenerator<StreamEvent> {
    const sessionId = crypto.randomUUID();

    yield { kind: "progress", stage: "fetching source" };

    const stream: AsyncIterable<Record<string, unknown>> =
      await this.graph.stream(
        { readme_url: url },
        {
          configurable: { thread_id: sessionId },
          metadata: {
            strategy: this.generationStrategy.name,
            model: this.llmModelName,
          },
          streamMode: "updates",
        },
      );

    let interrupt: unknown;
    for await (const update of stream) {
      if ("fetchSource" in update) {
        yield { kind: "progress", stage: "checking for existing quiz" };
      }
      if ("loadQuiz" in update) {
        const loaded = update.loadQuiz as { quiz?: unknown } | null;
        if (!loaded?.quiz) {
          yield { kind: "progress", stage: "generating questions" };
        }
      }
      if ("generateQuestions" in update) {
        yield { kind: "progress", stage: "saving quiz" };
      }
      if (INTERRUPT in update) {
        interrupt = (update[INTERRUPT] as { value: unknown }[])[0].value;
      }
    }

    if (interrupt === undefined) {
      throw new InvalidStateError(
        "Expected the graph to be interrupted after starting a session",
      );
    }

    yield {
      kind: "question",
      sessionId,
      question: AskQuestionPayloadSchema.parse(interrupt),
    };
  }

  /**
   * Submits an answer to the session.
   *
   * The response is the next question or the quiz result.
   *
   * @param sessionId - The ID of the session to submit the answer to.
   * @param selections - The selected answers for the current question.
   * @returns A promise that resolves to the SubmitAnswerResponse.
   */
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

  /**
   * Retrieves the current state of a session, including the next question or final score.
   * @param sessionId - The ID of the session to retrieve.
   * @returns A promise that resolves to the SubmitAnswerResponse.
   */
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
