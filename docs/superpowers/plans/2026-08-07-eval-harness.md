# Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `pnpm eval` harness: fixtures, deterministic structural checks, an LLM judge with its own provider seam, judge calibration with seeded negatives, and a scorecard runner.

**Architecture:** A new workspace package `evals/` runs scripts with `tsx`. It imports `makeGenerateQuestionsNode` from `server` by relative path. The judge is a separate LLM behind `JUDGE_PROVIDER` env config, Ollama by default. Structural checks are pure functions and run before the judge.

**Tech Stack:** TypeScript strict, Zod 4 (`zod/v4` import), `@langchain/ollama`, `@langchain/groq`, `@langchain/core`, tsx, vitest, dotenv.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-eval-harness-design.md`.
- Do NOT modify `server/src/agent/agent.schemas.ts`. The harness owns its own intended quiz shape.
- Zod validates all LLM output; one repair round, then fail loudly.
- Conventional commits with scope `evals` (e.g. `feat(evals): ...`). Imperative mood, no trailing period.
- All prose (docs, comments, JSDoc) in Simplified Technical English: active voice, one instruction per sentence, max 20 words for instructions, 25 for descriptions, no idioms, no em dashes.
- TypeScript strict; import zod as `import { z } from "zod/v4"` to match server.
- `evals/fixtures/cache/` and `evals/results/` are gitignored.
- Node >= 24, pnpm workspace monorepo.

---

### Task 1: Scaffold the evals workspace package

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)
- Create: `evals/package.json`
- Create: `evals/tsconfig.json`
- Create: `evals/vitest.config.ts`
- Create: `evals/.gitignore`

**Interfaces:**

- Produces: a workspace package named `@quizforge/evals` that later tasks add sources to. Root scripts `pnpm eval`, `pnpm eval:fixtures`, `pnpm eval:judge`, and `evals` included in root `pnpm test`.

- [ ] **Step 1: Add `evals` to the workspace**

In `pnpm-workspace.yaml`, change the `packages` list to:

```yaml
packages:
  - server
  - web
  - shared
  - evals
```

- [ ] **Step 2: Create `evals/package.json`**

```json
{
  "name": "@quizforge/evals",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "eval": "tsx src/run-eval.ts",
    "fixtures": "tsx src/fetch-fixtures.ts",
    "judge": "tsx src/calibrate-judge.ts",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@langchain/core": "^1.2.4",
    "@langchain/groq": "1.3.1",
    "@langchain/ollama": "1.3.0",
    "dotenv": "^17.4.2",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

Versions match `server/package.json` exactly. Do not bump them.

- [ ] **Step 3: Create `evals/tsconfig.json`**

`noEmit` plus `allowImportingTsExtensions` lets sources import server files by `.ts` path. tsx resolves those imports at run time.

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `evals/vitest.config.ts`**

No swc plugin. The evals package has no decorators, so the server's `emitDecoratorMetadata` concern does not apply.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    root: ".",
  },
});
```

- [ ] **Step 5: Create `evals/.gitignore`**

```
fixtures/cache/
results/
```

- [ ] **Step 6: Add root scripts**

In the root `package.json` `scripts` block, change `test` and add three eval scripts:

```json
    "test": "pnpm --filter server --filter shared --filter evals test",
    "eval": "pnpm --filter evals eval",
    "eval:fixtures": "pnpm --filter evals fixtures",
    "eval:judge": "pnpm --filter evals judge",
```

- [ ] **Step 7: Install and verify**

Run: `pnpm install`
Expected: lockfile updates, `@quizforge/evals` appears in the workspace.

Run: `pnpm --filter evals test`
Expected: vitest passes with "no test files found" (passWithNoTests).

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml evals/
git commit -m "feat(evals): scaffold the evals workspace package"
```

---

### Task 2: Quiz shape contract and structural checks

**Files:**

- Create: `evals/src/quiz-shape.ts`
- Test: `evals/src/quiz-shape.spec.ts`

**Interfaces:**

- Produces:
  - `EvalOptionSchema`, `EvalQuestionSchema`, `EvalQuizSchema` (Zod schemas)
  - `type EvalOption = z.infer<typeof EvalOptionSchema>` and same pattern for `EvalQuestion`, `EvalQuiz`
  - `structuralFailures(quiz: EvalQuiz): string[]` (empty array means pass)

- [ ] **Step 1: Write the failing test**

Create `evals/src/quiz-shape.spec.ts`:

```ts
import { EvalQuizSchema, structuralFailures } from "./quiz-shape";
import type { EvalQuestion, EvalQuiz } from "./quiz-shape";

function makeQuestion(overrides: Partial<EvalQuestion> = {}): EvalQuestion {
  return {
    text: "What does leftPad do?",
    type: "single",
    options: [
      { text: "Pads a string on the left", isCorrect: true },
      { text: "Pads a string on the right", isCorrect: false },
      { text: "Trims a string", isCorrect: false },
      { text: "Reverses a string", isCorrect: false },
    ],
    ...overrides,
  };
}

function makeQuiz(questionCount = 5): EvalQuiz {
  return {
    title: "left-pad quiz",
    questions: Array.from({ length: questionCount }, () => makeQuestion()),
  };
}

describe("EvalQuizSchema", () => {
  it("accepts a well-formed quiz", () => {
    expect(EvalQuizSchema.safeParse(makeQuiz()).success).toBe(true);
  });

  it("rejects a quiz without questions", () => {
    const parsed = EvalQuizSchema.safeParse({ title: "t" });
    expect(parsed.success).toBe(false);
  });
});

describe("structuralFailures", () => {
  it("returns no failures for a valid quiz", () => {
    expect(structuralFailures(makeQuiz(5))).toEqual([]);
    expect(structuralFailures(makeQuiz(8))).toEqual([]);
  });

  it("flags a quiz with fewer than 5 or more than 8 questions", () => {
    expect(structuralFailures(makeQuiz(4))).toContain(
      "quiz has 4 questions, expected 5 to 8",
    );
    expect(structuralFailures(makeQuiz(9))).toContain(
      "quiz has 9 questions, expected 5 to 8",
    );
  });

  it("flags a question without exactly 4 options", () => {
    const bad = makeQuestion();
    bad.options = bad.options.slice(0, 3);
    const quiz = makeQuiz(5);
    quiz.questions[2] = bad;
    expect(structuralFailures(quiz)).toContain(
      "question 3 has 3 options, expected 4",
    );
  });

  it("flags a single-answer question without exactly one correct option", () => {
    const bad = makeQuestion();
    bad.options[1].isCorrect = true;
    const quiz = makeQuiz(5);
    quiz.questions[0] = bad;
    expect(structuralFailures(quiz)).toContain(
      "question 1 is single-answer with 2 correct options, expected 1",
    );
  });

  it("flags a multi-answer question with fewer than 2 correct options", () => {
    const bad = makeQuestion({ type: "multi" });
    const quiz = makeQuiz(5);
    quiz.questions[4] = bad;
    expect(structuralFailures(quiz)).toContain(
      "question 5 is multi-answer with 1 correct option, expected 2 or more",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter evals exec vitest run src/quiz-shape.spec.ts`
Expected: FAIL, cannot resolve `./quiz-shape`.

- [ ] **Step 3: Write the implementation**

Create `evals/src/quiz-shape.ts`:

```ts
import { z } from "zod/v4";

/**
 * The intended full quiz shape. The server QuizSchema does not have
 * questions yet. This schema is the structural contract of the eval and
 * the acceptance test for that future schema work.
 */
export const EvalOptionSchema = z.object({
  text: z.string(),
  isCorrect: z.boolean(),
});

export const EvalQuestionSchema = z.object({
  text: z.string(),
  type: z.enum(["single", "multi"]),
  options: z.array(EvalOptionSchema),
});

export const EvalQuizSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  questions: z.array(EvalQuestionSchema),
});

export type EvalOption = z.infer<typeof EvalOptionSchema>;
export type EvalQuestion = z.infer<typeof EvalQuestionSchema>;
export type EvalQuiz = z.infer<typeof EvalQuizSchema>;

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 8;
const OPTIONS_PER_QUESTION = 4;

/** Returns one message per structural rule the quiz breaks. */
export function structuralFailures(quiz: EvalQuiz): string[] {
  const failures: string[] = [];

  const count = quiz.questions.length;
  if (count < MIN_QUESTIONS || count > MAX_QUESTIONS) {
    failures.push(`quiz has ${count} questions, expected 5 to 8`);
  }

  quiz.questions.forEach((question, index) => {
    const label = `question ${index + 1}`;
    if (question.options.length !== OPTIONS_PER_QUESTION) {
      failures.push(
        `${label} has ${question.options.length} options, expected 4`,
      );
    }
    const correct = question.options.filter((o) => o.isCorrect).length;
    if (question.type === "single" && correct !== 1) {
      failures.push(
        `${label} is single-answer with ${correct} correct options, expected 1`,
      );
    }
    if (question.type === "multi" && correct < 2) {
      failures.push(
        `${label} is multi-answer with ${correct} correct option, expected 2 or more`,
      );
    }
  });

  return failures;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter evals exec vitest run src/quiz-shape.spec.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add evals/src/quiz-shape.ts evals/src/quiz-shape.spec.ts
git commit -m "feat(evals): add the quiz shape contract and structural checks"
```

---

### Task 3: Fixture manifest and fetch script

**Files:**

- Create: `evals/fixtures/manifest.json`
- Create: `evals/src/fixtures.ts`
- Create: `evals/src/fetch-fixtures.ts`
- Test: `evals/src/fixtures.spec.ts`

**Interfaces:**

- Produces:
  - `ManifestSchema`, `type Fixture = { id: string; shape: string; url: string }`
  - `loadManifest(): Fixture[]` (reads and validates `fixtures/manifest.json`)
  - `fixtureCachePath(id: string): string` (absolute path of `fixtures/cache/<id>.md`)
  - `loadFixtureSource(id: string): string` (reads the cache, throws with a hint to run `pnpm eval:fixtures` when missing)

- [ ] **Step 1: Create the manifest**

Create `evals/fixtures/manifest.json`. The SHAs are pinned to the repo heads of 2026-08-07. The langgraphjs root README is a stub, so the fixture uses `libs/langgraph-core/README.md`.

```json
{
  "fixtures": [
    {
      "id": "langgraphjs",
      "shape": "library",
      "url": "https://raw.githubusercontent.com/langchain-ai/langgraphjs/6ac60da74f6b9e29d20b111a7947ac3060f1d2dd/libs/langgraph-core/README.md"
    },
    {
      "id": "pipecat",
      "shape": "application",
      "url": "https://raw.githubusercontent.com/pipecat-ai/pipecat/a2a9b0872cba6c6638d17d780fdb21e981c047b9/README.md"
    },
    {
      "id": "left-pad",
      "shape": "sparse",
      "url": "https://raw.githubusercontent.com/left-pad/left-pad/2fca6157fcca165438e0f9495cf0e5a4e6f71349/README.md"
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `evals/src/fixtures.spec.ts`:

```ts
import { loadManifest, fixtureCachePath } from "./fixtures";

describe("loadManifest", () => {
  it("returns the three pinned fixtures", () => {
    const fixtures = loadManifest();
    expect(fixtures.map((f) => f.id)).toEqual([
      "langgraphjs",
      "pipecat",
      "left-pad",
    ]);
    for (const fixture of fixtures) {
      expect(fixture.url).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/.+\/[0-9a-f]{40}\//,
      );
    }
  });
});

describe("fixtureCachePath", () => {
  it("points into fixtures/cache", () => {
    expect(fixtureCachePath("left-pad")).toMatch(
      /evals\/fixtures\/cache\/left-pad\.md$/,
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter evals exec vitest run src/fixtures.spec.ts`
Expected: FAIL, cannot resolve `./fixtures`.

- [ ] **Step 4: Write the implementation**

Create `evals/src/fixtures.ts`:

```ts
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { z } from "zod/v4";

const ManifestSchema = z.object({
  fixtures: z.array(
    z.object({
      id: z.string(),
      shape: z.string(),
      url: z.string().url(),
    }),
  ),
});

export type Fixture = z.infer<typeof ManifestSchema>["fixtures"][number];

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

/** Reads and validates fixtures/manifest.json. */
export function loadManifest(): Fixture[] {
  const raw = readFileSync(join(fixturesDir, "manifest.json"), "utf8");
  return ManifestSchema.parse(JSON.parse(raw)).fixtures;
}

/** Returns the cache file path for a fixture id. */
export function fixtureCachePath(id: string): string {
  return join(fixturesDir, "cache", `${id}.md`);
}

/** Reads a cached fixture. Throws when the cache is empty. */
export function loadFixtureSource(id: string): string {
  const path = fixtureCachePath(id);
  if (!existsSync(path)) {
    throw new Error(
      `Fixture ${id} is not cached. Run "pnpm eval:fixtures" first.`,
    );
  }
  return readFileSync(path, "utf8");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter evals exec vitest run src/fixtures.spec.ts`
Expected: PASS.

- [ ] **Step 6: Write the fetch script**

Create `evals/src/fetch-fixtures.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadManifest, fixtureCachePath } from "./fixtures";

for (const fixture of loadManifest()) {
  const response = await fetch(fixture.url);
  if (!response.ok) {
    throw new Error(
      `Fetch of fixture ${fixture.id} failed: ${response.status} ${response.statusText}`,
    );
  }
  const text = await response.text();
  const path = fixtureCachePath(fixture.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(`cached ${fixture.id} (${text.length} bytes)`);
}
```

- [ ] **Step 7: Run the fetch script**

Run: `pnpm eval:fixtures`
Expected: three `cached <id> (<n> bytes)` lines. `left-pad` is about 870 bytes, `langgraphjs` about 5.8 kB, `pipecat` about 43 kB.

Run: `git status --short`
Expected: no `fixtures/cache` entries appear (gitignored).

- [ ] **Step 8: Commit**

```bash
git add evals/fixtures/manifest.json evals/src/fixtures.ts evals/src/fixtures.spec.ts evals/src/fetch-fixtures.ts
git commit -m "feat(evals): add the fixture manifest and fetch script"
```

---

### Task 4: Judge provider seam and env loading

**Files:**

- Create: `evals/src/env.ts`
- Create: `evals/src/model-factory.ts`
- Test: `evals/src/model-factory.spec.ts`
- Modify: `.env.example`

**Interfaces:**

- Produces:
  - `evals/src/env.ts`: side-effect module, loads the root `.env`. Entry scripts import it first.
  - `buildChatModel(provider: string, model: string, apiKey?: string): BaseChatModel`
  - `buildJudgeModel(env?: NodeJS.ProcessEnv): BaseChatModel` (reads `JUDGE_PROVIDER`, `JUDGE_OLLAMA_MODEL`, `JUDGE_GROQ_MODEL`)
  - `buildGeneratorModel(env?: NodeJS.ProcessEnv): BaseChatModel` (reads `LLM_PROVIDER`, `OLLAMA_MODEL`, `GROQ_MODEL`, same defaults as the server seam)

- [ ] **Step 1: Write the failing test**

Create `evals/src/model-factory.spec.ts`:

```ts
import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import { buildJudgeModel, buildGeneratorModel } from "./model-factory";

describe("buildJudgeModel", () => {
  it("builds an Ollama judge from JUDGE_OLLAMA_MODEL", () => {
    const model = buildJudgeModel({
      JUDGE_PROVIDER: "ollama",
      JUDGE_OLLAMA_MODEL: "qwen3:14b",
    });
    expect(model).toBeInstanceOf(ChatOllama);
    expect((model as ChatOllama).model).toBe("qwen3:14b");
  });

  it("defaults the provider to ollama", () => {
    const model = buildJudgeModel({ JUDGE_OLLAMA_MODEL: "qwen3:14b" });
    expect(model).toBeInstanceOf(ChatOllama);
  });

  it("throws when the Ollama judge model is not set", () => {
    expect(() => buildJudgeModel({})).toThrow(
      "JUDGE_OLLAMA_MODEL is not set. Pick a judge model different from the generator model.",
    );
  });

  it("builds a Groq judge with a default model", () => {
    const model = buildJudgeModel({
      JUDGE_PROVIDER: "groq",
      GROQ_API_KEY: "test",
    });
    expect(model).toBeInstanceOf(ChatGroq);
    expect((model as ChatGroq).model).toBe("llama-3.3-70b-versatile");
  });

  it("throws on an unknown provider", () => {
    expect(() => buildJudgeModel({ JUDGE_PROVIDER: "openai" })).toThrow(
      "Unknown JUDGE_PROVIDER: openai",
    );
  });
});

describe("buildGeneratorModel", () => {
  it("mirrors the server defaults", () => {
    const model = buildGeneratorModel({});
    expect(model).toBeInstanceOf(ChatOllama);
    expect((model as ChatOllama).model).toBe("gemma4:31b");
  });

  it("builds Groq when LLM_PROVIDER is groq", () => {
    const model = buildGeneratorModel({
      LLM_PROVIDER: "groq",
      GROQ_API_KEY: "test",
    });
    expect(model).toBeInstanceOf(ChatGroq);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter evals exec vitest run src/model-factory.spec.ts`
Expected: FAIL, cannot resolve `./model-factory`.

- [ ] **Step 3: Write the implementation**

Create `evals/src/model-factory.ts`:

```ts
import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/** Builds a chat model for a provider name and model name. */
export function buildChatModel(
  provider: string,
  model: string,
  apiKey?: string,
): BaseChatModel {
  switch (provider) {
    case "ollama":
      return new ChatOllama({ model });
    case "groq":
      return new ChatGroq({ model, apiKey });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Builds the judge model from JUDGE_* variables. The judge has its own
 * seam so it can run on a different model than the generator.
 */
export function buildJudgeModel(
  env: NodeJS.ProcessEnv = process.env,
): BaseChatModel {
  const provider = env.JUDGE_PROVIDER ?? "ollama";
  switch (provider) {
    case "ollama": {
      const model = env.JUDGE_OLLAMA_MODEL;
      if (!model) {
        throw new Error(
          "JUDGE_OLLAMA_MODEL is not set. Pick a judge model different from the generator model.",
        );
      }
      return buildChatModel("ollama", model);
    }
    case "groq":
      return buildChatModel(
        "groq",
        env.JUDGE_GROQ_MODEL ?? "llama-3.3-70b-versatile",
        env.GROQ_API_KEY,
      );
    default:
      throw new Error(`Unknown JUDGE_PROVIDER: ${provider}`);
  }
}

/**
 * Builds the generator model from the same variables and defaults as the
 * server seam in server/src/agent/providers/llm.provider.ts.
 */
export function buildGeneratorModel(
  env: NodeJS.ProcessEnv = process.env,
): BaseChatModel {
  const provider = env.LLM_PROVIDER ?? "ollama";
  switch (provider) {
    case "ollama":
      return buildChatModel("ollama", env.OLLAMA_MODEL ?? "gemma4:31b");
    case "groq":
      return buildChatModel(
        "groq",
        env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        env.GROQ_API_KEY,
      );
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter evals exec vitest run src/model-factory.spec.ts`
Expected: PASS. The `apiKey` parameter matters here: `ChatGroq` falls back to `process.env.GROQ_API_KEY` and throws when neither is set, so the builders pass the key from their env argument.

- [ ] **Step 5: Create the env loader**

Create `evals/src/env.ts`:

```ts
// Loads the root .env so eval scripts see the same config as the server.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});
```

- [ ] **Step 6: Document the new variables**

Append to `.env.example` after the `# Agent config` block:

```
# Eval judge. The judge grades generated quizzes, so give it a different
# model than the generator. JUDGE_PROVIDER is "ollama" or "groq".
JUDGE_PROVIDER=ollama
JUDGE_OLLAMA_MODEL=
JUDGE_GROQ_MODEL=llama-3.3-70b-versatile
```

- [ ] **Step 7: Commit**

```bash
git add evals/src/model-factory.ts evals/src/model-factory.spec.ts evals/src/env.ts .env.example
git commit -m "feat(evals): add the judge and generator model seams"
```

---

### Task 5: The judge

**Files:**

- Create: `evals/src/judge.ts`
- Test: `evals/src/judge.spec.ts`

**Interfaces:**

- Consumes: `EvalQuestion`, `EvalQuiz` from `./quiz-shape` (Task 2).
- Produces:
  - `QuestionVerdictSchema` and `type QuestionVerdict = { answerable: boolean; singleDefensibleAnswer: boolean; distractorsPlausible: boolean; reasoning: string }`
  - `type CoverageVerdict = { keyTopics: string[]; coveredTopics: string[] }`
  - `judgeQuestion(llm: BaseChatModel, source: string, question: EvalQuestion): Promise<QuestionVerdict>`
  - `judgeCoverage(llm: BaseChatModel, source: string, quiz: EvalQuiz): Promise<CoverageVerdict>`
  - Both give the model one repair round on schema failure, then throw.

- [ ] **Step 1: Write the failing test**

Create `evals/src/judge.spec.ts`. `FakeListChatModel` returns canned responses in order, the same pattern as `server/src/agent/nodes/generate-questions.spec.ts`.

```ts
import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseMessage } from "@langchain/core/messages";
import { judgeQuestion, judgeCoverage } from "./judge";
import type { EvalQuestion, EvalQuiz } from "./quiz-shape";

const question: EvalQuestion = {
  text: "What does leftPad do?",
  type: "single",
  options: [
    { text: "Pads a string on the left", isCorrect: true },
    { text: "Pads a string on the right", isCorrect: false },
    { text: "Trims a string", isCorrect: false },
    { text: "Reverses a string", isCorrect: false },
  ],
};

const quiz: EvalQuiz = { title: "left-pad quiz", questions: [question] };

const verdict = {
  answerable: true,
  singleDefensibleAnswer: true,
  distractorsPlausible: true,
  reasoning: "The README states the behavior.",
};

describe("judgeQuestion", () => {
  it("returns the parsed verdict and sends source plus question", async () => {
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(verdict)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await judgeQuestion(llm, "String left pad", question);

    expect(result).toEqual(verdict);
    const [input] = llmSpy.mock.calls[0];
    const messages = input as BaseMessage[];
    const text = messages.map((m) => m.content).join("\n");
    expect(text).toContain("String left pad");
    expect(text).toContain("What does leftPad do?");
  });

  it("repairs once on a schema failure", async () => {
    const llm = new FakeListChatModel({
      responses: ["{}", JSON.stringify(verdict)],
    });
    const llmSpy = vi.spyOn(llm, "invoke");

    const result = await judgeQuestion(llm, "src", question);

    expect(result).toEqual(verdict);
    expect(llmSpy).toHaveBeenCalledTimes(2);
  });

  it("fails loudly when the repair round also fails", async () => {
    const llm = new FakeListChatModel({ responses: ["{}", "{}"] });

    await expect(judgeQuestion(llm, "src", question)).rejects.toThrow(
      "Judge output did not match the schema",
    );
  });
});

describe("judgeCoverage", () => {
  it("returns key topics and covered topics", async () => {
    const coverage = {
      keyTopics: ["padding", "install", "usage"],
      coveredTopics: ["padding"],
    };
    const llm = new FakeListChatModel({
      responses: [JSON.stringify(coverage)],
    });

    const result = await judgeCoverage(llm, "String left pad", quiz);

    expect(result).toEqual(coverage);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter evals exec vitest run src/judge.spec.ts`
Expected: FAIL, cannot resolve `./judge`.

- [ ] **Step 3: Write the implementation**

Create `evals/src/judge.ts`:

```ts
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { z } from "zod/v4";
import { z as zod } from "zod/v4";
import type { EvalQuestion, EvalQuiz } from "./quiz-shape";

export const QuestionVerdictSchema = zod.object({
  answerable: zod
    .boolean()
    .describe("True only if the source alone answers the question"),
  singleDefensibleAnswer: zod
    .boolean()
    .describe("True only if the marked answers are the only defensible ones"),
  distractorsPlausible: zod
    .boolean()
    .describe("True if wrong options are wrong but on topic"),
  reasoning: zod.string().describe("One or two sentences of justification"),
});

export const CoverageVerdictSchema = zod.object({
  keyTopics: zod
    .array(zod.string())
    .describe("The 5 to 10 key topics of the source document"),
  coveredTopics: zod
    .array(zod.string())
    .describe("The subset of keyTopics that the quiz asks about"),
});

export type QuestionVerdict = z.infer<typeof QuestionVerdictSchema>;
export type CoverageVerdict = z.infer<typeof CoverageVerdictSchema>;

const QUESTION_SYSTEM_PROMPT = `
You are a strict quiz reviewer. You receive a source document and one quiz question.
Judge the question only against the source document. Do not use outside knowledge as evidence.
Rules:
- answerable: true only if the source document alone contains the facts needed to answer.
  If the question needs outside knowledge, or contradicts the source, set false.
- singleDefensibleAnswer: for a single-answer question, true only if exactly one option is
  defensible given the source. For a multi-answer question, true only if the marked correct
  options are exactly the defensible ones.
- distractorsPlausible: true if every incorrect option is wrong per the source but stays on
  topic. Set false if any incorrect option is absurd or unrelated.
- reasoning: one or two sentences.
`;

const COVERAGE_SYSTEM_PROMPT = `
You are a strict quiz reviewer. You receive a source document and the questions of a quiz.
First list the 5 to 10 key topics of the document.
Then list which of those key topics at least one question asks about.
Use the same topic strings in both lists.
`;

/** Invokes the model with schema validation and one repair round. */
async function invokeJudge<Schema extends zod.ZodType>(
  llm: BaseChatModel,
  schema: Schema,
  system: string,
  request: string,
): Promise<z.infer<Schema>> {
  const model = llm.withStructuredOutput(schema);
  const messages = [new SystemMessage(system), new HumanMessage(request)];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return schema.parse(await model.invoke(messages));
    } catch (error) {
      if (attempt === 2) {
        throw new Error(
          `Judge output did not match the schema after ${attempt} attempts`,
          { cause: error },
        );
      }
      messages.push(
        new HumanMessage(
          "Your previous response did not match the required schema. Respond again and follow the schema exactly.",
        ),
      );
    }
  }
  throw new Error("unreachable");
}

function formatQuestion(question: EvalQuestion): string {
  const options = question.options
    .map(
      (option, index) =>
        `${index + 1}. ${option.text}${option.isCorrect ? " (marked correct)" : ""}`,
    )
    .join("\n");
  return `Question (${question.type}-answer): ${question.text}\nOptions:\n${options}`;
}

/** Judges one question against the source document. */
export function judgeQuestion(
  llm: BaseChatModel,
  source: string,
  question: EvalQuestion,
): Promise<QuestionVerdict> {
  const request = `Source document:\n${source}\n\n${formatQuestion(question)}`;
  return invokeJudge(llm, QuestionVerdictSchema, QUESTION_SYSTEM_PROMPT, request);
}

/** Judges topic coverage of the whole quiz against the source document. */
export function judgeCoverage(
  llm: BaseChatModel,
  source: string,
  quiz: EvalQuiz,
): Promise<CoverageVerdict> {
  const questions = quiz.questions
    .map((q, i) => `${i + 1}. ${q.text}`)
    .join("\n");
  const request = `Source document:\n${source}\n\nQuiz questions:\n${questions}`;
  return invokeJudge(llm, CoverageVerdictSchema, COVERAGE_SYSTEM_PROMPT, request);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter evals exec vitest run src/judge.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add evals/src/judge.ts evals/src/judge.spec.ts
git commit -m "feat(evals): add the LLM judge for questions and coverage"
```

---

### Task 6: Seeded negatives and judge calibration

**Files:**

- Create: `evals/src/negatives.ts`
- Create: `evals/src/calibration.ts`
- Create: `evals/src/calibrate-judge.ts`
- Test: `evals/src/calibration.spec.ts`

**Interfaces:**

- Consumes: `judgeQuestion`, `QuestionVerdict` (Task 5), `buildJudgeModel` (Task 4), `loadFixtureSource` (Task 3).
- Produces:
  - `type Negative = { fixtureId: string; mustFail: "answerable" | "singleDefensibleAnswer"; note: string; question: EvalQuestion }`
  - `negatives: Negative[]` (9 entries, 3 per fixture)
  - `calibrationFailures(results: { negative: Negative; verdict: QuestionVerdict }[]): string[]`

- [ ] **Step 1: Write the negatives**

Create `evals/src/negatives.ts`. Each fixture gets three planted bad questions: one hallucinated fact, one with two defensible answers, one answerable from general knowledge but not from the document. The facts below come from the pinned fixture contents; do not edit them to look nicer.

```ts
import type { EvalQuestion } from "./quiz-shape";

export interface Negative {
  fixtureId: string;
  /** The verdict field the judge must set to false. */
  mustFail: "answerable" | "singleDefensibleAnswer";
  note: string;
  question: EvalQuestion;
}

/**
 * Hand-written bad questions the judge must catch. If the judge passes
 * any of them, the judge fails calibration, not the generator.
 */
export const negatives: Negative[] = [
  {
    fixtureId: "langgraphjs",
    mustFail: "answerable",
    note: "hallucinated fact: the README names no default checkpointer",
    question: {
      text: "Which checkpointer does LangGraph use by default?",
      type: "single",
      options: [
        { text: "PostgresSaver", isCorrect: true },
        { text: "MemorySaver", isCorrect: false },
        { text: "RedisSaver", isCorrect: false },
        { text: "SqliteSaver", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "langgraphjs",
    mustFail: "singleDefensibleAnswer",
    note: "two defensible answers: the README lists both as core features",
    question: {
      text: "Which capability does the LangGraph README present as a reason to use LangGraph?",
      type: "single",
      options: [
        { text: "Durable execution", isCorrect: true },
        { text: "Human-in-the-loop", isCorrect: false },
        { text: "Automatic prompt optimization", isCorrect: false },
        { text: "Built-in vector storage", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "langgraphjs",
    mustFail: "answerable",
    note: "general knowledge: the README never mentions the npm registry launch year",
    question: {
      text: "In which year did the npm registry launch?",
      type: "single",
      options: [
        { text: "2010", isCorrect: true },
        { text: "2014", isCorrect: false },
        { text: "2016", isCorrect: false },
        { text: "2008", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "pipecat",
    mustFail: "answerable",
    note: "hallucinated fact: the README names no default transport",
    question: {
      text: "Which transport does Pipecat select by default for a new pipeline?",
      type: "single",
      options: [
        { text: "WebRTC", isCorrect: true },
        { text: "WebSockets", isCorrect: false },
        { text: "HTTP long polling", isCorrect: false },
        { text: "gRPC streams", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "pipecat",
    mustFail: "singleDefensibleAnswer",
    note: "two defensible answers: the README lists both under what you can build",
    question: {
      text: "Which kind of application does the Pipecat README say you can build?",
      type: "single",
      options: [
        { text: "Voice assistants", isCorrect: true },
        { text: "AI companions", isCorrect: false },
        { text: "Photo editors", isCorrect: false },
        { text: "Spreadsheet plugins", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "pipecat",
    mustFail: "answerable",
    note: "general knowledge: Python facts, not in the README",
    question: {
      text: "Which company employed the original creator of the Python language?",
      type: "single",
      options: [
        { text: "Google", isCorrect: true },
        { text: "Microsoft", isCorrect: false },
        { text: "Dropbox", isCorrect: false },
        { text: "IBM", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "left-pad",
    mustFail: "answerable",
    note: "hallucinated fact: the README documents no maximum length",
    question: {
      text: "What is the maximum pad length that left-pad supports?",
      type: "single",
      options: [
        { text: "1024 characters", isCorrect: true },
        { text: "255 characters", isCorrect: false },
        { text: "80 characters", isCorrect: false },
        { text: "No limit", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "left-pad",
    mustFail: "singleDefensibleAnswer",
    note: "two defensible answers: the README shows both calls returning padded numbers",
    question: {
      text: "Per the README examples, which call returns a zero-padded result?",
      type: "single",
      options: [
        { text: "leftPad(1, 2, '0')", isCorrect: true },
        { text: "leftPad(17, 5, 0)", isCorrect: false },
        { text: "leftPad('foo', 5)", isCorrect: false },
        { text: "leftPad('foobar', 6)", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "left-pad",
    mustFail: "answerable",
    note: "general knowledge: the 2016 unpublish incident is not in the README",
    question: {
      text: "In which year did the left-pad unpublish incident break npm builds?",
      type: "single",
      options: [
        { text: "2016", isCorrect: true },
        { text: "2014", isCorrect: false },
        { text: "2018", isCorrect: false },
        { text: "2020", isCorrect: false },
      ],
    },
  },
];
```

- [ ] **Step 2: Write the failing calibration test**

Create `evals/src/calibration.spec.ts`:

```ts
import { calibrationFailures } from "./calibration";
import { negatives } from "./negatives";
import type { QuestionVerdict } from "./judge";

function verdictWith(overrides: Partial<QuestionVerdict>): QuestionVerdict {
  return {
    answerable: true,
    singleDefensibleAnswer: true,
    distractorsPlausible: true,
    reasoning: "",
    ...overrides,
  };
}

describe("negatives", () => {
  it("has three negatives per fixture", () => {
    const counts = new Map<string, number>();
    for (const negative of negatives) {
      counts.set(negative.fixtureId, (counts.get(negative.fixtureId) ?? 0) + 1);
    }
    expect(counts.get("langgraphjs")).toBe(3);
    expect(counts.get("pipecat")).toBe(3);
    expect(counts.get("left-pad")).toBe(3);
  });
});

describe("calibrationFailures", () => {
  it("passes when the judge fails every negative on the expected field", () => {
    const results = negatives.map((negative) => ({
      negative,
      verdict: verdictWith({ [negative.mustFail]: false }),
    }));
    expect(calibrationFailures(results)).toEqual([]);
  });

  it("reports a negative the judge let through", () => {
    const results = negatives.map((negative) => ({
      negative,
      verdict: verdictWith({}),
    }));
    const failures = calibrationFailures(results);
    expect(failures).toHaveLength(negatives.length);
    expect(failures[0]).toContain(negatives[0].note);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter evals exec vitest run src/calibration.spec.ts`
Expected: FAIL, cannot resolve `./calibration`.

- [ ] **Step 4: Write the calibration logic**

Create `evals/src/calibration.ts`:

```ts
import type { Negative } from "./negatives";
import type { QuestionVerdict } from "./judge";

export interface CalibrationResult {
  negative: Negative;
  verdict: QuestionVerdict;
}

/**
 * Returns one message per negative the judge let through. The judge must
 * set the expected verdict field to false for every planted bad question.
 */
export function calibrationFailures(results: CalibrationResult[]): string[] {
  return results
    .filter(({ negative, verdict }) => verdict[negative.mustFail])
    .map(
      ({ negative }) =>
        `judge passed a planted bad question (${negative.fixtureId}: ${negative.note})`,
    );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter evals exec vitest run src/calibration.spec.ts`
Expected: PASS.

- [ ] **Step 6: Write the calibration script**

Create `evals/src/calibrate-judge.ts`:

```ts
import "./env";
import { buildJudgeModel } from "./model-factory";
import { judgeQuestion } from "./judge";
import { loadFixtureSource } from "./fixtures";
import { negatives } from "./negatives";
import { calibrationFailures, type CalibrationResult } from "./calibration";

const judge = buildJudgeModel();
const results: CalibrationResult[] = [];

for (const negative of negatives) {
  const source = loadFixtureSource(negative.fixtureId);
  const verdict = await judgeQuestion(judge, source, negative.question);
  const caught = !verdict[negative.mustFail];
  console.log(
    `${caught ? "caught" : "MISSED"} ${negative.fixtureId}: ${negative.note}`,
  );
  results.push({ negative, verdict });
}

const failures = calibrationFailures(results);
if (failures.length > 0) {
  console.error(`\nJudge calibration failed:`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
console.log(`\nJudge calibration passed: ${negatives.length}/${negatives.length} negatives caught`);
```

- [ ] **Step 7: Run the calibration against the real judge**

Precondition: `JUDGE_OLLAMA_MODEL` is set in `.env` and the model is pulled in Ollama. If it is not set, run the unit tests only and tell Martyn the live calibration still needs a model.

Run: `pnpm eval:judge`
Expected: nine `caught ...` lines and a final `Judge calibration passed`. A `MISSED` line means the judge model or the judge prompt needs work; report the result either way.

- [ ] **Step 8: Commit**

```bash
git add evals/src/negatives.ts evals/src/calibration.ts evals/src/calibration.spec.ts evals/src/calibrate-judge.ts
git commit -m "feat(evals): add seeded negatives and judge calibration"
```

---

### Task 7: Scorecard runner

**Files:**

- Create: `evals/src/scorecard.ts`
- Create: `evals/src/run-eval.ts`
- Test: `evals/src/scorecard.spec.ts`

**Interfaces:**

- Consumes: everything above, plus `makeGenerateQuestionsNode` from `../../server/src/agent/nodes/generate-questions.ts`.
- Produces:
  - `type FixtureScore = { fixtureId: string; structuralFailures: string[]; answerability: number | null; singleDefensible: number | null; distractorPlausibility: number | null; coverage: number | null }` (fractions 0 to 1, `null` when there was nothing to judge)
  - `aggregateScore(fixtureId, quiz, verdicts, coverage): FixtureScore`
  - `formatScorecard(scores: FixtureScore[]): string`
  - `pnpm eval` prints the scorecard and writes `evals/results/<ISO-timestamp>.json`

- [ ] **Step 1: Write the failing test**

Create `evals/src/scorecard.spec.ts`:

```ts
import { aggregateScore, formatScorecard } from "./scorecard";
import type { EvalQuiz } from "./quiz-shape";
import type { QuestionVerdict, CoverageVerdict } from "./judge";

const quiz: EvalQuiz = {
  title: "t",
  questions: [
    {
      text: "q1",
      type: "single",
      options: [
        { text: "a", isCorrect: true },
        { text: "b", isCorrect: false },
        { text: "c", isCorrect: false },
        { text: "d", isCorrect: false },
      ],
    },
    {
      text: "q2",
      type: "multi",
      options: [
        { text: "a", isCorrect: true },
        { text: "b", isCorrect: true },
        { text: "c", isCorrect: false },
        { text: "d", isCorrect: false },
      ],
    },
  ],
};

function verdict(overrides: Partial<QuestionVerdict>): QuestionVerdict {
  return {
    answerable: true,
    singleDefensibleAnswer: true,
    distractorsPlausible: true,
    reasoning: "",
    ...overrides,
  };
}

describe("aggregateScore", () => {
  it("computes fractions per criterion", () => {
    const verdicts = [
      verdict({ answerable: false }),
      verdict({ distractorsPlausible: false }),
    ];
    const coverage: CoverageVerdict = {
      keyTopics: ["a", "b", "c", "d"],
      coveredTopics: ["a", "b", "x"],
    };

    const score = aggregateScore("left-pad", quiz, verdicts, coverage);

    expect(score.answerability).toBe(0.5);
    expect(score.distractorPlausibility).toBe(0.5);
    // singleDefensible counts single-answer questions only: q1 of q1.
    expect(score.singleDefensible).toBe(1);
    // "x" is not a key topic, so it does not count.
    expect(score.coverage).toBe(0.5);
  });

  it("returns null scores when there are no verdicts", () => {
    const score = aggregateScore("left-pad", quiz, [], null);
    expect(score.answerability).toBeNull();
    expect(score.coverage).toBeNull();
  });
});

describe("formatScorecard", () => {
  it("renders one row per fixture with percentages", () => {
    const score = aggregateScore("left-pad", quiz, [verdict({})], {
      keyTopics: ["a", "b"],
      coveredTopics: ["a"],
    });
    const table = formatScorecard([score]);
    expect(table).toContain("left-pad");
    expect(table).toContain("100%");
    expect(table).toContain("50%");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter evals exec vitest run src/scorecard.spec.ts`
Expected: FAIL, cannot resolve `./scorecard`.

- [ ] **Step 3: Write the implementation**

Create `evals/src/scorecard.ts`:

```ts
import type { EvalQuiz } from "./quiz-shape";
import type { QuestionVerdict, CoverageVerdict } from "./judge";
import { structuralFailures } from "./quiz-shape";

export interface FixtureScore {
  fixtureId: string;
  structuralFailures: string[];
  answerability: number | null;
  singleDefensible: number | null;
  distractorPlausibility: number | null;
  coverage: number | null;
}

function fraction(hits: number, total: number): number | null {
  return total === 0 ? null : hits / total;
}

/** Folds judge verdicts into one score row for a fixture. */
export function aggregateScore(
  fixtureId: string,
  quiz: EvalQuiz,
  verdicts: QuestionVerdict[],
  coverage: CoverageVerdict | null,
): FixtureScore {
  const singles = quiz.questions
    .map((question, index) => ({ question, verdict: verdicts[index] }))
    .filter(({ question, verdict }) => question.type === "single" && verdict);

  const key = new Set(coverage?.keyTopics ?? []);
  const covered = (coverage?.coveredTopics ?? []).filter((topic) =>
    key.has(topic),
  );

  return {
    fixtureId,
    structuralFailures: structuralFailures(quiz),
    answerability: fraction(
      verdicts.filter((v) => v.answerable).length,
      verdicts.length,
    ),
    singleDefensible: fraction(
      singles.filter(({ verdict }) => verdict.singleDefensibleAnswer).length,
      singles.length,
    ),
    distractorPlausibility: fraction(
      verdicts.filter((v) => v.distractorsPlausible).length,
      verdicts.length,
    ),
    coverage: coverage ? fraction(covered.length, key.size) : null,
  };
}

function cell(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

/** Renders score rows as a fixed-width text table. */
export function formatScorecard(scores: FixtureScore[]): string {
  const header = [
    "fixture".padEnd(14),
    "answerable".padEnd(12),
    "1-defensible".padEnd(14),
    "distractors".padEnd(13),
    "coverage".padEnd(10),
    "structural",
  ].join("");

  const rows = scores.map((score) =>
    [
      score.fixtureId.padEnd(14),
      cell(score.answerability).padEnd(12),
      cell(score.singleDefensible).padEnd(14),
      cell(score.distractorPlausibility).padEnd(13),
      cell(score.coverage).padEnd(10),
      score.structuralFailures.length === 0
        ? "pass"
        : `${score.structuralFailures.length} failures`,
    ].join(""),
  );

  return [header, ...rows].join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter evals exec vitest run src/scorecard.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the runner**

Create `evals/src/run-eval.ts`. The runner runs the real generation node per fixture, validates against the eval shape, then judges. A quiz that fails `EvalQuizSchema.parse` (today: every quiz, the server schema has no questions yet) is recorded as a structural failure and skips the judge.

```ts
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { makeGenerateQuestionsNode } from "../../server/src/agent/nodes/generate-questions.ts";
import { buildGeneratorModel, buildJudgeModel } from "./model-factory";
import { loadManifest, loadFixtureSource } from "./fixtures";
import { EvalQuizSchema } from "./quiz-shape";
import { judgeQuestion, judgeCoverage } from "./judge";
import { aggregateScore, formatScorecard, type FixtureScore } from "./scorecard";

const generator = buildGeneratorModel();
const judge = buildJudgeModel();
const generate = makeGenerateQuestionsNode(generator);

const scores: FixtureScore[] = [];

for (const fixture of loadManifest()) {
  console.log(`evaluating ${fixture.id} (${fixture.shape})...`);
  const source = loadFixtureSource(fixture.id);

  const update = await generate(
    { readme_url: fixture.url, source, quiz: undefined },
    {} as never,
  );

  const parsed = EvalQuizSchema.safeParse(
    (update as { quiz: unknown }).quiz,
  );
  if (!parsed.success) {
    scores.push({
      fixtureId: fixture.id,
      structuralFailures: ["quiz does not match the eval quiz shape"],
      answerability: null,
      singleDefensible: null,
      distractorPlausibility: null,
      coverage: null,
    });
    continue;
  }

  const quiz = parsed.data;
  const verdicts = [];
  for (const question of quiz.questions) {
    verdicts.push(await judgeQuestion(judge, source, question));
  }
  const coverage = await judgeCoverage(judge, source, quiz);
  scores.push(aggregateScore(fixture.id, quiz, verdicts, coverage));
}

console.log(`\n${formatScorecard(scores)}\n`);

const resultsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "results",
);
mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-");
const resultPath = join(resultsDir, `${stamp}.json`);
writeFileSync(
  resultPath,
  JSON.stringify(
    {
      timestamp: stamp,
      generator: {
        provider: process.env.LLM_PROVIDER ?? "ollama",
        strategy: process.env.GENERATION_STRATEGY ?? "single-pass",
        ollamaModel: process.env.OLLAMA_MODEL ?? "gemma4:31b",
        groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      },
      judge: {
        provider: process.env.JUDGE_PROVIDER ?? "ollama",
        ollamaModel: process.env.JUDGE_OLLAMA_MODEL ?? null,
        groqModel: process.env.JUDGE_GROQ_MODEL ?? null,
      },
      scores,
    },
    null,
    2,
  ),
);
console.log(`results written to ${resultPath}`);
```

- [ ] **Step 6: Typecheck the package**

Run: `pnpm --filter evals typecheck`
Expected: clean. The cross-package import into `server/src` typechecks through `allowImportingTsExtensions`.

- [ ] **Step 7: Run the full unit test suite**

Run: `pnpm test`
Expected: server, shared, and evals suites all pass.

- [ ] **Step 8: Run the harness end to end**

Precondition: Ollama running with the generator model, `JUDGE_OLLAMA_MODEL` set. If not available, stop after the unit tests and report.

Run: `pnpm eval`
Expected today: each fixture row shows `1 failures` (structural) with every judged column `n/a`, because the server QuizSchema has no questions yet. This output is correct per the spec. A results JSON file appears in `evals/results/`.

- [ ] **Step 9: Commit**

```bash
git add evals/src/scorecard.ts evals/src/scorecard.spec.ts evals/src/run-eval.ts
git commit -m "feat(evals): add the scorecard runner behind pnpm eval"
```

---

### Task 8: Documentation updates

**Files:**

- Modify: `README.md` (Evals and Observability sections)
- Modify: `docs/PLAN.md` (eval harness bullet)

**Interfaces:**

- Consumes: nothing. Text only.

- [ ] **Step 1: Swap Langfuse for LangSmith in README.md**

In the Evals section, replace the sentence:

> The application sends the results to Langfuse as dataset runs.

with:

> The application sends the results to LangSmith as experiment runs.

In the Observability section, replace both Langfuse mentions:

> The application sends traces of the generation calls to LangSmith. To
> enable this, set the `LANGSMITH_*` variables in the environment. A trace
> contains the source URL, the strategy, the token usage and the number of
> repair attempts.

- [ ] **Step 2: Swap Langfuse for LangSmith in docs/PLAN.md**

Change the Phase 2 bullet `pnpm eval runs the set and prints a scorecard; results logged to Langfuse as dataset runs` to end with `results logged to LangSmith as experiment runs`. Change the Phase 3 bullet `Langfuse tracing on the generation call` to `LangSmith tracing on the generation call`.

- [ ] **Step 3: Verify no Langfuse mentions remain**

Run: `grep -ri langfuse README.md docs/PLAN.md`
Expected: no output.

- [ ] **Step 4: Commit**

Do not tick the PLAN.md eval checkboxes in this task. Martyn ticks them after he verifies the harness.

```bash
git add README.md docs/PLAN.md
git commit -m "docs: replace Langfuse with LangSmith for eval and tracing"
```
