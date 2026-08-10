import { z } from "zod/v4";
import { AskQuestionPayloadSchema, QuizResultSchema } from "./quiz";

/**
 * The SSE event union and its wire format (docs/PLAN.md Phase 3.5).
 * The server encodes with encodeSseEvent. The web decodes with
 * SseEventDecoder. Both sides import this module, so the wire format
 * has one definition.
 *
 * Boundary rule: progress and token events stream, structured payloads
 * land whole. Partial question JSON never crosses the wire.
 */

/** The progress stages of a session start, in order. */
export const ProgressStageSchema = z.enum([
  "fetching source",
  "generating questions",
  "saving quiz",
]);
export type ProgressStage = z.infer<typeof ProgressStageSchema>;

export const StreamEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("progress"),
    stage: ProgressStageSchema.describe("The stage the agent entered"),
  }),
  // Reserved for Phase 3.5 Tier 2: framing-line tokens, never quiz JSON.
  z.object({
    kind: z.literal("token"),
    text: z.string().describe("One streamed token of a framing line"),
  }),
  z.object({
    kind: z.literal("question"),
    sessionId: z
      .uuid()
      .optional()
      .describe("Set on the session start stream only"),
    question: AskQuestionPayloadSchema,
  }),
  // Reserved for Phase 3.5 Tier 2: the final score on the answer stream.
  z.object({
    kind: z.literal("result"),
    result: QuizResultSchema,
  }),
  // A failure after the SSE headers went out. The HTTP status is spent
  // at that point, so the error travels as an event.
  z.object({
    kind: z.literal("error"),
    message: z.string().describe("The message to show the user"),
  }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;

/** Encodes one event as one SSE frame. */
export function encodeSseEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Decodes one SSE stream incrementally. Feed each received chunk to
 * decode() and receive the events whose frames are complete. A partial
 * frame stays buffered until the closing blank line arrives. A frame
 * that fails schema validation throws (fail loudly, one shared rule
 * with LLM output).
 */
export class SseEventDecoder {
  private buffer = "";

  decode(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];
    let separator: number;
    while ((separator = this.buffer.indexOf("\n\n")) !== -1) {
      const frame = this.buffer.slice(0, separator);
      this.buffer = this.buffer.slice(separator + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join("\n");
      if (data === "") continue; // A comment or keep-alive frame.
      events.push(StreamEventSchema.parse(JSON.parse(data)));
    }
    return events;
  }
}
