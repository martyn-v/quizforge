import { describe, expect, it } from "vitest";
import {
  encodeSseEvent,
  SseEventDecoder,
  StreamEventSchema,
  type StreamEvent,
} from "./events";

const OPTION_ID = "00000000-0000-4000-8000-200000000000";
const QUESTION_ID = "00000000-0000-4000-8000-100000000000";
const SESSION_ID = "00000000-0000-4000-8000-000000000000";
const ATTEMPT_ID = "00000000-0000-4000-8000-300000000000";

const question = {
  question: {
    id: QUESTION_ID,
    text: "q",
    type: "single",
    options: [{ id: OPTION_ID, text: "a" }],
  },
  index: 0,
  total: 5,
};

describe("StreamEventSchema", () => {
  it.each([
    { label: "a progress event", event: { kind: "progress", stage: "fetching source" } },
    { label: "a token event", event: { kind: "token", text: "Here " } },
    { label: "a question event with a session id", event: { kind: "question", sessionId: SESSION_ID, question } },
    { label: "a question event without a session id", event: { kind: "question", question } },
    {
      label: "a result event",
      event: {
        kind: "result",
        result: { finalScore: 4, scores: { [QUESTION_ID]: 4 }, attemptId: ATTEMPT_ID },
      },
    },
    { label: "an error event", event: { kind: "error", message: "boom" } },
  ])("accepts $label", ({ event }) => {
    expect(StreamEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([
    { label: "an unknown kind", event: { kind: "half-question" } },
    { label: "an unknown progress stage", event: { kind: "progress", stage: "reticulating" } },
  ])("rejects $label", ({ event }) => {
    expect(StreamEventSchema.safeParse(event).success).toBe(false);
  });

  it("strips isCorrect from a question event on parse", () => {
    const leaked = {
      kind: "question",
      question: {
        ...question,
        question: {
          ...question.question,
          options: [{ id: OPTION_ID, text: "a", isCorrect: true }],
        },
      },
    };
    expect(JSON.stringify(StreamEventSchema.parse(leaked))).not.toContain("isCorrect");
  });
});

describe("encodeSseEvent", () => {
  it("frames the event as one SSE data line", () => {
    const event: StreamEvent = { kind: "progress", stage: "fetching source" };
    expect(encodeSseEvent(event)).toBe(
      'data: {"kind":"progress","stage":"fetching source"}\n\n',
    );
  });
});

describe("SseEventDecoder", () => {
  it("decodes an encoded event back to the same value", () => {
    const event: StreamEvent = { kind: "question", sessionId: SESSION_ID, question } as StreamEvent;
    const decoder = new SseEventDecoder();
    expect(decoder.decode(encodeSseEvent(event))).toEqual([event]);
  });

  it("decodes two frames arriving in one chunk", () => {
    const decoder = new SseEventDecoder();
    const events = decoder.decode(
      encodeSseEvent({ kind: "progress", stage: "fetching source" }) +
        encodeSseEvent({ kind: "progress", stage: "generating questions" }),
    );
    expect(events.map((e) => (e.kind === "progress" ? e.stage : e.kind))).toEqual([
      "fetching source",
      "generating questions",
    ]);
  });

  it("holds a frame split across chunks until the frame completes", () => {
    const decoder = new SseEventDecoder();
    const frame = encodeSseEvent({ kind: "error", message: "boom" });
    expect(decoder.decode(frame.slice(0, 10))).toEqual([]);
    expect(decoder.decode(frame.slice(10))).toEqual([
      { kind: "error", message: "boom" },
    ]);
  });

  it("ignores comment lines and blank frames", () => {
    const decoder = new SseEventDecoder();
    expect(decoder.decode(": keep-alive\n\n")).toEqual([]);
  });

  it("throws on a frame that is not a valid event", () => {
    const decoder = new SseEventDecoder();
    expect(() => decoder.decode('data: {"kind":"nope"}\n\n')).toThrow();
  });
});
