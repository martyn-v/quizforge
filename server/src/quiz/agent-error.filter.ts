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
 * The nearest mapped ancestor class wins, so subclasses of a mapped
 * error keep its status. An error with no mapped ancestor falls back
 * to a 500.
 */
@Catch(AgentError)
export class AgentErrorFilter implements ExceptionFilter {
  catch(exception: AgentError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      this.statusFor(exception) ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }

  private statusFor(exception: AgentError): HttpStatus | undefined {
    for (
      let ctor = exception.constructor;
      ctor;
      ctor = Object.getPrototypeOf(ctor) as typeof ctor
    ) {
      const status = STATUS_BY_ERROR.get(ctor as never);
      if (status !== undefined) return status;
    }
    return undefined;
  }
}
