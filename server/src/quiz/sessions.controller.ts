import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseFilters,
} from "@nestjs/common";
import {
  StartSessionRequestSchema,
  SubmitAnswerRequestSchema,
  type StartSessionRequest,
  type StartSessionResponse,
  type SubmitAnswerRequest,
  type SubmitAnswerResponse,
} from "@quizforge/shared";
import { AgentService } from "../agent/agent.service";
import { AgentErrorFilter } from "./agent-error.filter";
import { ZodValidationPipe } from "./zod-validation.pipe";

/**
 * Thin HTTP layer over the AgentService surface (docs/PLAN.md Phase 2).
 * JSON responses now; the SSE upgrade comes with Phase 3.5.
 */
@Controller("sessions")
@UseFilters(AgentErrorFilter)
export class SessionsController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  startSession(
    @Body(new ZodValidationPipe(StartSessionRequestSchema))
    body: StartSessionRequest,
  ): Promise<StartSessionResponse> {
    return this.agentService.startSession(body.url);
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
