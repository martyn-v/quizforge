/**
 * Retry support for provider rate limits. The Groq free tier enforces
 * tokens per minute, and its 429 message mentions billing. LangChain
 * matches that word against its quota patterns and stops retrying, so
 * the harness retries here instead.
 */

const DEFAULT_WAIT_MS = 5000;
const WAIT_BUFFER_MS = 250;
const DEFAULT_MAX_ATTEMPTS = 5;

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** True when the error is a provider rate limit. */
export function isRateLimitError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  if (status === 429) {
    return true;
  }
  return /rate[_ ]?limit/i.test(messageOf(error));
}

/** Reads the wait hint, for example "try again in 3.01s", as milliseconds. */
function waitHintMs(error: unknown): number | undefined {
  const match = messageOf(error).match(/try again in ([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
}

interface RetryOptions {
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs fn and retries rate limit errors. Waits for the hinted time plus
 * a small buffer, or 5 seconds when the error gives no hint.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = DEFAULT_MAX_ATTEMPTS, sleep = realSleep }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const wait = (waitHintMs(error) ?? DEFAULT_WAIT_MS) + WAIT_BUFFER_MS;
      console.warn(
        `rate limited, waiting ${wait}ms (attempt ${attempt}/${maxAttempts})`,
      );
      await sleep(wait);
    }
  }
}
