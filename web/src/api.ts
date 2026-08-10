import {
  SseEventDecoder,
  type ProgressStage,
  type StartSessionResponse,
  type SubmitAnswerResponse,
} from '@quizforge/shared'

/** The API base URL. Set VITE_API_URL to point at a non-local server. */
const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:3000'

/** An error response from the API. Carries the server's message. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('The API is not reachable. Start it with pnpm dev.', 0)
  }
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status)
  }
  return response.json() as Promise<T>
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json()
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message: unknown }).message
      if (typeof message === 'string') return message
      if (Array.isArray(message)) return message.join(', ')
    }
  } catch {
    // A non-JSON error body falls through to the generic message.
  }
  return `The API returned status ${response.status}.`
}

/**
 * Starts a session over the SSE stream. Native EventSource cannot
 * POST, so the stream arrives through fetch and its body reader.
 * Progress events go to onProgress as they land; the promise resolves
 * with the first question and rejects on an error event.
 */
export async function startSessionStream(
  url: string,
  onProgress: (stage: ProgressStage) => void,
): Promise<StartSessionResponse> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  } catch {
    throw new ApiError('The API is not reachable. Start it with pnpm dev.', 0)
  }
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status)
  }
  if (!response.body) {
    throw new ApiError('The API sent no response body.', 0)
  }

  const reader = response.body.getReader()
  const bytes = new TextDecoder()
  const frames = new SseEventDecoder()
  let started: StartSessionResponse | undefined

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    for (const event of frames.decode(bytes.decode(value, { stream: true }))) {
      if (event.kind === 'progress') onProgress(event.stage)
      if (event.kind === 'error') throw new ApiError(event.message, 0)
      if (event.kind === 'question' && event.sessionId !== undefined) {
        started = { sessionId: event.sessionId, question: event.question }
      }
    }
  }

  if (!started) {
    throw new ApiError('The stream ended before the first question.', 0)
  }
  return started
}

export function submitAnswer(
  sessionId: string,
  selections: string[],
): Promise<SubmitAnswerResponse> {
  return post<SubmitAnswerResponse>(`/sessions/${sessionId}/answers`, {
    selections,
  })
}
