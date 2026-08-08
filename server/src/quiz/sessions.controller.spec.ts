import type { AskQuestionPayload } from "@quizforge/shared";
import { oid, qid } from "../agent/quiz-fixtures";
import { SessionsController } from "./sessions.controller";

/**
 * The controller is a pass-through over AgentService. These tests pin
 * the delegation; validation and error mapping have their own specs.
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

function makeController() {
  const agentService = {
    startSession: vi.fn(),
    submitAnswer: vi.fn(),
    getSession: vi.fn(),
  };
  const controller = new SessionsController(agentService as never);
  return { controller, agentService };
}

describe("SessionsController", () => {
  it("starts a session from the url in the body", async () => {
    const { controller, agentService } = makeController();
    const started = { sessionId: crypto.randomUUID(), question };
    agentService.startSession.mockResolvedValue(started);

    const response = await controller.startSession({
      url: "https://github.com/o/r/blob/main/README.md",
    });

    expect(response).toEqual(started);
    expect(agentService.startSession).toHaveBeenCalledExactlyOnceWith(
      "https://github.com/o/r/blob/main/README.md",
    );
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
