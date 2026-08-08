import { HttpStatus } from "@nestjs/common";
import {
  AgentError,
  FetchSourceError,
  GenerateQuestionsError,
  InvalidStateError,
  PersistQuizError,
  SessionNotFoundError,
} from "../common/errors";

type AgentErrorClass = new (...args: never[]) => AgentError;

export const STATUS_BY_ERROR = new Map<AgentErrorClass, HttpStatus>([
  [FetchSourceError, HttpStatus.UNPROCESSABLE_ENTITY], // bad URL/doc: caller's input
  [GenerateQuestionsError, HttpStatus.BAD_GATEWAY], // upstream model failed
  [SessionNotFoundError, HttpStatus.NOT_FOUND], // unknown or expired session id
  [PersistQuizError, HttpStatus.INTERNAL_SERVER_ERROR],
  [InvalidStateError, HttpStatus.INTERNAL_SERVER_ERROR],
]);
