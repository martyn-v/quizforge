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
 * Controller for managing quiz sessions.
 *
 * It provides endpoints to start a new session, submit answers, and retrieve the current state of a session.
 */
@Controller("sessions")
@UseFilters(AgentErrorFilter)
export class SessionsController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * Starts a new quiz session with the provided URL.
   * The request body is validated against the StartSessionRequestSchema.
   * By default, the response is streamed as Server-Sent Events (SSE). If the "stream" query parameter is set to "false", a plain JSON response is returned instead.
   *
   * @param body - The request body containing the URL to start the session with. It is validated against the StartSessionRequestSchema.
   * @param res - The Express response object.
   * @param stream - A query parameter indicating whether to stream the response as SSE. If "false", a plain JSON response is returned.
   * @returns A promise that resolves when the response has been sent.
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

  /**
   * Submits an answer to the session. The response is the next question
   * or the final score if the quiz is complete. The request body is
   * validated against the SubmitAnswerRequestSchema.
   *
   * 200, not the POST default 201: a submit advances the session and
   * may create nothing (a re-prompt returns the same question).
   *
   * @param sessionId - The ID of the session to submit the answer to.
   * @param body - The request body containing the selections.
   * @returns A promise that resolves to the SubmitAnswerResponse.
   */
  @Post(":id/answers")
  @HttpCode(HttpStatus.OK)
  submitAnswer(
    @Param("id") sessionId: string,
    @Body(new ZodValidationPipe(SubmitAnswerRequestSchema))
    body: SubmitAnswerRequest,
  ): Promise<SubmitAnswerResponse> {
    return this.agentService.submitAnswer(sessionId, body.selections);
  }

  /**
   * Retrieves the current state of a session, including the next question or final score.
   * The response is validated against the SubmitAnswerResponse schema.
   *
   * @param sessionId - The ID of the session to retrieve.
   * @returns A promise that resolves to the SubmitAnswerResponse.
   */
  @Get(":id")
  getSession(@Param("id") sessionId: string): Promise<SubmitAnswerResponse> {
    return this.agentService.getSession(sessionId);
  }
}
