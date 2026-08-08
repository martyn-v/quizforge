import type {
  StartSessionResponse,
  SubmitAnswerResponse,
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

export function startSession(url: string): Promise<StartSessionResponse> {
  return post<StartSessionResponse>('/sessions', { url })
}

export function submitAnswer(
  sessionId: string,
  selections: string[],
): Promise<SubmitAnswerResponse> {
  return post<SubmitAnswerResponse>(`/sessions/${sessionId}/answers`, {
    selections,
  })
}
