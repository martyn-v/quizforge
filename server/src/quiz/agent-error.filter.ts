import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
import { AgentError } from "../common/errors";
import { STATUS_BY_ERROR } from "./exceptions";

/**
 * Maps AgentError classes to HTTP statuses via STATUS_BY_ERROR.
 * An unmapped subclass falls back to a 500.
 */
@Catch(AgentError)
export class AgentErrorFilter implements ExceptionFilter {
  catch(exception: AgentError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      STATUS_BY_ERROR.get(exception.constructor as never) ??
      HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }
}
