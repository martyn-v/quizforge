import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseFilters,
} from "@nestjs/common";
import type { Response } from "express";
import {
  encodeSseEvent,
  StartSessionRequestSchema,
  SubmitAnswerRequestSchema,
  type StartSessionRequest,
  type SubmitAnswerRequest,
  type SubmitAnswerResponse,
} from "@quizforge/shared";
import { AgentService } from "../agent/agent.service";
import { AgentError } from "../common/errors";
import { AgentErrorFilter } from "./agent-error.filter";
import { ZodValidationPipe } from "./zod-validation.pipe";

/**
 * Thin HTTP layer over the AgentService surface (docs/PLAN.md Phase 2).
 * The start endpoint streams SSE by default; ?stream=false keeps the
 * plain JSON response for curl demos and tests (Phase 3.5).
 */
@Controller("sessions")
@UseFilters(AgentErrorFilter)
export class SessionsController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * Starts a session. The default response is an SSE stream of the
   * shared event union. A failure after the headers went out cannot
   * change the status, so it travels as a terminal error event. Only
   * an AgentError message is safe to show; anything else is masked.
   */
  @Post()
  async startSession(
    @Body(new ZodValidationPipe(StartSessionRequestSchema))
    body: StartSessionRequest,
    @Res() res: Response,
    @Query("stream") stream?: string,
  ): Promise<void> {
    if (stream === "false") {
      res.json(await this.agentService.startSession(body.url));
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      for await (const event of this.agentService.startSessionStream(
        body.url,
      )) {
        res.write(encodeSseEvent(event));
      }
    } catch (error) {
      const message =
        error instanceof AgentError ? error.message : "Something went wrong.";
      res.write(encodeSseEvent({ kind: "error", message }));
    }
    res.end();
  }

  // 200, not the POST default 201: a submit advances the session and
  // may create nothing (a re-prompt returns the same question).
  @Post(":id/answers")
  @HttpCode(HttpStatus.OK)
  submitAnswer(
    @Param("id") sessionId: string,
    @Body(new ZodValidationPipe(SubmitAnswerRequestSchema))
    body: SubmitAnswerRequest,
  ): Promise<SubmitAnswerResponse> {
    return this.agentService.submitAnswer(sessionId, body.selections);
  }

  @Get(":id")
  getSession(@Param("id") sessionId: string): Promise<SubmitAnswerResponse> {
    return this.agentService.getSession(sessionId);
  }
}
