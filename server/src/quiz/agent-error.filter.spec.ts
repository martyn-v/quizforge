import { HttpStatus, type ArgumentsHost } from "@nestjs/common";
import {
  FetchSourceError,
  GenerateQuestionsError,
  InvalidAnswerError,
  SessionNotFoundError,
} from "../common/errors";
import { AgentErrorFilter } from "./agent-error.filter";

/** A minimal http host whose response records status and body. */
function makeHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("AgentErrorFilter", () => {
  it.each([
    [new FetchSourceError("bad url"), HttpStatus.UNPROCESSABLE_ENTITY],
    [new GenerateQuestionsError("model down"), HttpStatus.BAD_GATEWAY],
    [new SessionNotFoundError("unknown session"), HttpStatus.NOT_FOUND],
  ])("maps %o to its mapped status", (error, expected) => {
    const { host, status, json } = makeHost();

    new AgentErrorFilter().catch(error, host);

    expect(status).toHaveBeenCalledExactlyOnceWith(expected);
    expect(json).toHaveBeenCalledExactlyOnceWith({
      statusCode: expected,
      error: error.name,
      message: error.message,
    });
  });

  it("maps an unmapped agent error to a 500", () => {
    const { host, status, json } = makeHost();

    new AgentErrorFilter().catch(new InvalidAnswerError("stray"), host);

    expect(status).toHaveBeenCalledExactlyOnceWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(json).toHaveBeenCalledExactlyOnceWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "InvalidAnswerError",
      message: "stray",
    });
  });
});
