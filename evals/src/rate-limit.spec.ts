import { withRateLimitRetry, isRateLimitError } from "./rate-limit.ts";

function groqRateLimitError(): Error {
  const error = new Error(
    "Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 12000, Used 10655, Requested 1947. Please try again in 3.01s.",
  );
  (error as Error & { status: number }).status = 429;
  return error;
}

describe("isRateLimitError", () => {
  it("recognizes a 429 status", () => {
    expect(isRateLimitError(groqRateLimitError())).toBe(true);
  });

  it("recognizes a rate limit message without a status", () => {
    expect(isRateLimitError(new Error("Rate limit reached for model"))).toBe(
      true,
    );
  });

  it("rejects other errors", () => {
    expect(isRateLimitError(new Error("Invalid API key"))).toBe(false);
  });
});

describe("withRateLimitRetry", () => {
  it("returns the result when the call succeeds", async () => {
    const result = await withRateLimitRetry(async () => 42);
    expect(result).toBe(42);
  });

  it("retries a rate limit error and honors the wait hint", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls === 1) {
        throw groqRateLimitError();
      }
      return "ok";
    };

    const result = await withRateLimitRetry(fn, { sleep });

    expect(result).toBe("ok");
    expect(calls).toBe(2);
    // 3.01s hint plus the 250ms buffer.
    expect(waits).toEqual([3260]);
  });

  it("gives up after maxAttempts and rethrows", async () => {
    const sleep = async () => {};
    const fn = async () => {
      throw groqRateLimitError();
    };

    await expect(
      withRateLimitRetry(fn, { sleep, maxAttempts: 3 }),
    ).rejects.toThrow("Rate limit reached");
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      throw new Error("Invalid API key");
    };

    await expect(withRateLimitRetry(fn)).rejects.toThrow("Invalid API key");
    expect(calls).toBe(1);
  });
});
