import {
  encodeSseEvent,
  type AskQuestionPayload,
  type StreamEvent,
} from "@quizforge/shared";
import { FetchSourceError } from "../common/errors";
import { oid, qid } from "../agent/quiz-fixtures";
import { SessionsController } from "./sessions.controller";

/**
 * The controller is a pass-through over AgentService. These tests pin
 * the delegation and the SSE framing; validation and error mapping
 * have their own specs.
 */

const question: AskQuestionPayload = {
  question: {
    id: qid(0),
    text: "Question 1",
    type: "single",
    options: [{ id: oid(0, 0), text: "Option 1" }],
  },
  index: 0,
  total: 5,
};

const URL = "https://github.com/o/r/blob/main/README.md";

function makeController() {
  const agentService = {
    startSession: vi.fn(),
    startSessionStream: vi.fn(),
    submitAnswer: vi.fn(),
    getSession: vi.fn(),
  };
  const controller = new SessionsController(agentService as never);
  return { controller, agentService };
}

/** The slice of the express Response the controller touches. */
function makeRes() {
  return {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn<(frame: string) => boolean>(),
    end: vi.fn(),
    json: vi.fn(),
  };
}

function streamOf(events: StreamEvent[], failure?: Error) {
  return (async function* () {
    await Promise.resolve(); // The real stream never yields synchronously.
    yield* events;
    if (failure) throw failure;
  })();
}

describe("SessionsController", () => {
  it("streams each event as an SSE frame and ends the response", async () => {
    const { controller, agentService } = makeController();
    const sessionId = crypto.randomUUID();
    const events: StreamEvent[] = [
      { kind: "progress", stage: "fetching source" },
      { kind: "question", sessionId, question },
    ];
    agentService.startSessionStream.mockReturnValue(streamOf(events));
    const res = makeRes();

    await controller.startSession({ url: URL }, res as never, undefined);

    expect(agentService.startSessionStream).toHaveBeenCalledExactlyOnceWith(URL);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream",
    );
    expect(res.write.mock.calls.map(([frame]) => frame)).toEqual(
      events.map(encodeSseEvent),
    );
    expect(res.end).toHaveBeenCalledOnce();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("turns an AgentError mid-stream into a terminal error event", async () => {
    // ARRANGE: the SSE headers are out, so no status can carry the
    // failure. The error must travel as an event and end the stream.
    const { controller, agentService } = makeController();
    agentService.startSessionStream.mockReturnValue(
      streamOf(
        [{ kind: "progress", stage: "fetching source" }],
        new FetchSourceError("The source returned 404"),
      ),
    );
    const res = makeRes();

    await controller.startSession({ url: URL }, res as never, undefined);

    expect(res.write).toHaveBeenLastCalledWith(
      encodeSseEvent({ kind: "error", message: "The source returned 404" }),
    );
    expect(res.end).toHaveBeenCalledOnce();
  });

  it("masks an unexpected error behind a generic message", async () => {
    // ARRANGE: a non-agent error may carry internals; none may leak.
    const { controller, agentService } = makeController();
    agentService.startSessionStream.mockReturnValue(
      streamOf([], new Error("connect ECONNREFUSED 10.0.0.7:5432")),
    );
    const res = makeRes();

    await controller.startSession({ url: URL }, res as never, undefined);

    expect(res.write).toHaveBeenLastCalledWith(
      encodeSseEvent({ kind: "error", message: "Something went wrong." }),
    );
    expect(res.end).toHaveBeenCalledOnce();
  });

  it("returns plain JSON when the caller opts out with stream=false", async () => {
    const { controller, agentService } = makeController();
    const started = { sessionId: crypto.randomUUID(), question };
    agentService.startSession.mockResolvedValue(started);
    const res = makeRes();

    await controller.startSession({ url: URL }, res as never, "false");

    expect(agentService.startSession).toHaveBeenCalledExactlyOnceWith(URL);
    expect(agentService.startSessionStream).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledExactlyOnceWith(started);
    expect(res.write).not.toHaveBeenCalled();
  });

  it("submits the selections for the session in the path", async () => {
    const { controller, agentService } = makeController();
    const sessionId = crypto.randomUUID();
    agentService.submitAnswer.mockResolvedValue({ kind: "question", question });

    const response = await controller.submitAnswer(sessionId, {
      selections: [oid(0, 0)],
    });

    expect(response).toEqual({ kind: "question", question });
    expect(agentService.submitAnswer).toHaveBeenCalledExactlyOnceWith(
      sessionId,
      [oid(0, 0)],
    );
  });

  it("reads the session in the path", async () => {
    const { controller, agentService } = makeController();
    const sessionId = crypto.randomUUID();
    agentService.getSession.mockResolvedValue({ kind: "question", question });

    const response = await controller.getSession(sessionId);

    expect(response).toEqual({ kind: "question", question });
    expect(agentService.getSession).toHaveBeenCalledExactlyOnceWith(sessionId);
  });
});
