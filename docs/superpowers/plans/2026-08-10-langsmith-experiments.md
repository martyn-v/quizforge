# LangSmith Experiment Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload each `pnpm eval` batch to LangSmith as one experiment, with one run per fixture and the judge scores as feedback.

**Architecture:** A new module `evals/src/langsmith-upload.ts` holds a pure score-to-feedback mapper and an upload function. The eval runner calls the upload function once, after it writes the local results file. The upload is gated on the existing tracing env vars and can never fail the eval run.

**Tech Stack:** TypeScript (ESM, run via tsx), `langsmith` JS SDK 0.8.9 (`Client` low-level API), vitest.

**Spec:** `docs/superpowers/specs/2026-08-10-langsmith-experiments-design.md`

## Global Constraints

- Docs and code comments use Simplified Technical English. Active voice. Descriptive sentences 25 words or fewer. No em dashes anywhere.
- Conventional commits, scope `evals`: `feat(evals): ...`, `docs(evals): ...`. Imperative mood, no trailing period.
- TypeScript strict. No `any` in new code.
- `langsmith` is pinned exactly to `0.8.9` (the version already in the lockfile). No caret.
- Upload failure logs a warning and returns. `pnpm eval` must never fail because LangSmith is unreachable.
- No test touches the network. `evals/vitest.setup.ts` already forces `LANGSMITH_TRACING=false`.
- The working tree has an unrelated modified file (`server/src/agent/nodes/generate-questions.ts`). Never `git add -A`. Stage only the files named in each commit step.

---

### Task 1: `feedbackEntries` pure mapper

**Files:**
- Create: `evals/src/langsmith-upload.ts`
- Create: `evals/src/langsmith-upload.spec.ts`

**Interfaces:**
- Consumes: `FixtureScore` from `evals/src/scorecard.ts` (fields: `fixtureId: string`, `structuralFailures: string[]`, `answerability | singleDefensible | distractorPlausibility | coverage | multiFraction: number | null`, `retries: number | null`).
- Produces: `interface FeedbackEntry { key: string; score: number; comment?: string }` and `function feedbackEntries(score: FixtureScore): FeedbackEntry[]`. Task 2 calls `feedbackEntries` inside the upload loop.

- [ ] **Step 1: Write the failing test**

Create `evals/src/langsmith-upload.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { feedbackEntries } from "./langsmith-upload.ts";
import type { FixtureScore } from "./scorecard.ts";

const fullRow: FixtureScore = {
  fixtureId: "pipecat",
  structuralFailures: [],
  answerability: 1,
  singleDefensible: 0.75,
  distractorPlausibility: 0.5,
  coverage: 0.6,
  multiFraction: 0.4,
  retries: 1,
};

describe("feedbackEntries", () => {
  it("maps a full row to seven entries", () => {
    const entries = feedbackEntries(fullRow);
    expect(entries).toEqual([
      { key: "answerability", score: 1 },
      { key: "single_defensible", score: 0.75 },
      { key: "distractor_plausibility", score: 0.5 },
      { key: "coverage", score: 0.6 },
      { key: "multi_fraction", score: 0.4 },
      { key: "retries", score: 1 },
      { key: "structural", score: 1 },
    ]);
  });

  it("drops null metrics and keeps structural", () => {
    const failed: FixtureScore = {
      fixtureId: "left-pad",
      structuralFailures: ["generation failed: boom"],
      answerability: null,
      singleDefensible: null,
      distractorPlausibility: null,
      coverage: null,
      multiFraction: null,
      retries: null,
    };
    expect(feedbackEntries(failed)).toEqual([
      {
        key: "structural",
        score: 0,
        comment: "generation failed: boom",
      },
    ]);
  });

  it("joins several structural failures into one comment", () => {
    const entries = feedbackEntries({
      ...fullRow,
      structuralFailures: ["too few questions", "option count is not 4"],
    });
    expect(entries.at(-1)).toEqual({
      key: "structural",
      score: 0,
      comment: "too few questions; option count is not 4",
    });
  });

  it("keeps a zero retries entry", () => {
    const entries = feedbackEntries({ ...fullRow, retries: 0 });
    expect(entries).toContainEqual({ key: "retries", score: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @quizforge/evals test -- langsmith-upload`
Expected: FAIL. The module `./langsmith-upload.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `evals/src/langsmith-upload.ts`:

```ts
import type { FixtureScore } from "./scorecard.ts";

export interface FeedbackEntry {
  key: string;
  score: number;
  comment?: string;
}

/** Maps one score row to LangSmith feedback entries. Pure. */
export function feedbackEntries(score: FixtureScore): FeedbackEntry[] {
  const metrics: Array<[string, number | null]> = [
    ["answerability", score.answerability],
    ["single_defensible", score.singleDefensible],
    ["distractor_plausibility", score.distractorPlausibility],
    ["coverage", score.coverage],
    ["multi_fraction", score.multiFraction],
    ["retries", score.retries],
  ];
  const entries: FeedbackEntry[] = [];
  for (const [key, value] of metrics) {
    if (value !== null) {
      entries.push({ key, score: value });
    }
  }
  if (score.structuralFailures.length === 0) {
    entries.push({ key: "structural", score: 1 });
  } else {
    entries.push({
      key: "structural",
      score: 0,
      comment: score.structuralFailures.join("; "),
    });
  }
  return entries;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @quizforge/evals test -- langsmith-upload`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add evals/src/langsmith-upload.ts evals/src/langsmith-upload.spec.ts
git commit -m "feat(evals): map score rows to LangSmith feedback entries"
```

---

### Task 2: `uploadScorecard` and the runner call site

**Files:**
- Modify: `evals/package.json` (add dependency)
- Modify: `evals/src/langsmith-upload.ts` (add `uploadScorecard`)
- Modify: `evals/src/langsmith-upload.spec.ts` (add gate test)
- Modify: `evals/src/scripts/run-eval.ts:66,138-163` (hoist manifest, call upload)

**Interfaces:**
- Consumes: `feedbackEntries` from Task 1. `Fixture` from `evals/src/fixtures.ts` (`{ id: string; shape: string; url: string }`). `loadManifest(): Fixture[]`.
- Produces: `interface UploadOptions { fixtures: Fixture[]; scores: FixtureScore[]; generator: Record<string, string | null>; judge: Record<string, string | null>; comment: string | null; stamp: string }` and `async function uploadScorecard(options: UploadOptions): Promise<void>`.

- [ ] **Step 1: Add the dependency**

In `evals/package.json`, add to `dependencies` (exact pin, matching the version already in the lockfile):

```json
"langsmith": "0.8.9",
```

Run: `pnpm install`
Expected: exits 0, no lockfile churn beyond the new direct reference.

- [ ] **Step 2: Write the failing gate test**

Append to `evals/src/langsmith-upload.spec.ts`:

```ts
import { uploadScorecard } from "./langsmith-upload.ts";

describe("uploadScorecard", () => {
  it("resolves without network when tracing is off", async () => {
    // vitest.setup.ts forces LANGSMITH_TRACING=false. The gate must
    // return before any client is built, so this resolves offline.
    await expect(
      uploadScorecard({
        fixtures: [],
        scores: [],
        generator: {},
        judge: {},
        comment: null,
        stamp: "2026-08-10T00-00-00.000Z",
      }),
    ).resolves.toBeUndefined();
  });
});
```

Merge the import with the existing one from `./langsmith-upload.ts`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @quizforge/evals test -- langsmith-upload`
Expected: FAIL. `uploadScorecard` is not exported.

- [ ] **Step 4: Implement `uploadScorecard`**

In `evals/src/langsmith-upload.ts`, add imports at the top and the function below `feedbackEntries`:

```ts
import { randomUUID } from "node:crypto";
import { Client } from "langsmith";
import type { Fixture } from "./fixtures.ts";
```

```ts
export interface UploadOptions {
  fixtures: Fixture[];
  scores: FixtureScore[];
  generator: Record<string, string | null>;
  judge: Record<string, string | null>;
  comment: string | null;
  stamp: string;
}

/**
 * Uploads one eval batch to LangSmith as an experiment. The dataset
 * holds one example per fixture. Each score row becomes one run with
 * feedback. A failure logs a warning; the eval run never fails here.
 */
export async function uploadScorecard(options: UploadOptions): Promise<void> {
  if (
    process.env.LANGSMITH_TRACING !== "true" ||
    !process.env.LANGSMITH_API_KEY
  ) {
    console.log("LangSmith upload skipped: tracing is off.");
    return;
  }
  const projectName = `eval-${options.stamp}`;
  try {
    const client = new Client();
    const datasetName = process.env.LANGSMITH_PROJECT ?? "default-evals";

    const dataset = (await client.hasDataset({ datasetName }))
      ? await client.readDataset({ datasetName })
      : await client.createDataset(datasetName, {
          description: "QuizForge eval fixtures, one example per fixture.",
        });

    // Upsert examples. The fixture id in the metadata is the key.
    const exampleIds = new Map<string, string>();
    for await (const example of client.listExamples({
      datasetId: dataset.id,
    })) {
      const fixtureId = (example.metadata as { fixtureId?: string } | null)
        ?.fixtureId;
      if (fixtureId) {
        exampleIds.set(fixtureId, example.id);
      }
    }
    for (const fixture of options.fixtures) {
      if (exampleIds.has(fixture.id)) {
        continue;
      }
      const example = await client.createExample({
        dataset_id: dataset.id,
        inputs: { fixtureId: fixture.id, shape: fixture.shape, url: fixture.url },
        metadata: { fixtureId: fixture.id },
      });
      exampleIds.set(fixture.id, example.id);
    }

    const project = await client.createProject({
      projectName,
      referenceDatasetId: dataset.id,
      metadata: {
        generator: options.generator,
        judge: options.judge,
        comment: options.comment,
      },
    });

    // Runs first, then one flush, then feedback. createRun queues into
    // a batch; feedback needs the run to exist on the server.
    const now = Date.now();
    const runIds = new Map<string, string>();
    for (const score of options.scores) {
      const runId = randomUUID();
      runIds.set(score.fixtureId, runId);
      await client.createRun({
        id: runId,
        name: score.fixtureId,
        run_type: "chain",
        project_name: projectName,
        reference_example_id: exampleIds.get(score.fixtureId),
        inputs: { fixtureId: score.fixtureId },
        outputs: { ...score },
        start_time: now,
        end_time: now,
      });
    }
    await client.flush();

    for (const score of options.scores) {
      const runId = runIds.get(score.fixtureId);
      if (!runId) {
        continue;
      }
      for (const entry of feedbackEntries(score)) {
        await client.createFeedback({
          runId,
          sessionId: project.id,
          key: entry.key,
          score: entry.score,
          comment: entry.comment,
          feedbackSourceType: "api",
        });
      }
    }
    console.log(`LangSmith experiment uploaded: ${projectName}`);
  } catch (error) {
    console.warn(`LangSmith upload failed: ${String(error)}`);
  }
}
```

Notes for the implementer:
- `client.createRun` returns `Promise<void>` and batches internally. That is why the run id comes from `randomUUID()` and why `flush()` runs before the feedback loop.
- `createFeedback` requires `sessionId` (the project id) next to `runId` in SDK 0.8.9.
- `hasDataset`, `readDataset`, `createDataset`, `listExamples`, `createExample`, `createProject`, `createFeedback`, `flush` are all methods on `Client`. No other import is needed.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @quizforge/evals test -- langsmith-upload`
Expected: PASS, 5 tests, no network access.

- [ ] **Step 6: Wire the runner**

In `evals/src/scripts/run-eval.ts`:

1. Add the import next to the other local imports:

```ts
import { uploadScorecard } from "../langsmith-upload.ts";
```

2. Hoist the manifest so the upload can reuse it. Replace line 66:

```ts
for (const fixture of loadManifest()) {
```

with:

```ts
const fixtures = loadManifest();

for (const fixture of fixtures) {
```

3. After the final `console.log(`results written to ${resultPath}`);` line, add:

```ts
await uploadScorecard({
  fixtures,
  scores,
  generator: generatorInfo,
  judge: judgeInfo,
  comment,
  stamp,
});
```

- [ ] **Step 7: Typecheck and full test run**

Run: `pnpm --filter @quizforge/evals typecheck && pnpm --filter @quizforge/evals test`
Expected: both exit 0.

Then run the offline smoke check (tracing off, so only the skip line appears after the scorecard):

Run: `LANGSMITH_TRACING=false pnpm eval "plan smoke check" 2>&1 | tail -5`
Expected: the results path line, then `LangSmith upload skipped: tracing is off.`
Note: this performs live generation with the configured provider. If no provider is reachable, skip this check; the live verification in Task 4 covers it.

- [ ] **Step 8: Commit**

```bash
git add evals/package.json pnpm-lock.yaml evals/src/langsmith-upload.ts evals/src/langsmith-upload.spec.ts evals/src/scripts/run-eval.ts
git commit -m "feat(evals): upload eval batches as LangSmith experiments"
```

---

### Task 3: README update

**Files:**
- Modify: `README.md` (Observability section, Roadmap list)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: docs only.

- [ ] **Step 1: Extend the Observability section**

After the paragraph that ends `Unit tests force tracing off and never send runs.`, add:

```markdown
Each eval batch also uploads one LangSmith experiment. The dataset
`<project>-evals` holds one example per fixture. Each fixture becomes
one run, and the judge scores attach as feedback. The upload uses the
same `LANGSMITH_*` variables. A failed upload logs a warning and does
not fail the eval run.
```

- [ ] **Step 2: Remove the delivered roadmap entry**

Delete this bullet from the Roadmap section:

```markdown
- **Eval results as LangSmith experiment runs.** The scorecard stays in a
  local JSON file today. An upload step after the eval loop can log each
  fixture as a run with the judge scores as feedback.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document eval experiment upload, trim roadmap"
```

---

### Task 4: Live verification (manual, needs API keys)

**Files:** none.

- [ ] **Step 1: Run one live eval with tracing on**

Requires `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, and a reachable generation provider in `.env`.

Run: `pnpm eval "langsmith experiment upload verification"`
Expected: scorecard prints, then `LangSmith experiment uploaded: eval-<stamp>`.

- [ ] **Step 2: Read the experiment back through the API**

Use a short tsx script (scratch, do not commit) with the same `Client` to check:
- `client.readProject({ projectName: "eval-<stamp>" })` exists and has `reference_dataset_id` set.
- `client.listRuns({ projectName: "eval-<stamp>" })` yields one run per fixture, each with a `reference_example_id`.
- `client.listFeedback({ runIds: [...] })` yields the entries from the scorecard.

- [ ] **Step 3: Close out**

After Martyn confirms the experiment renders in the LangSmith UI, tick the TODO.md item (`LLM observability, experiments half`). TODO.md is local-only, so there is nothing to commit there.
