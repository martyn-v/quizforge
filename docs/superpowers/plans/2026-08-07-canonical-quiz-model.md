# Canonical Quiz Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One canonical quiz model in `shared`, with stable ids on questions and options, and answers and scores keyed by question id.

**Architecture:** The quiz passes through named stages: `DraftQuiz` (LLM output, no ids), `Quiz` (database ids, from `persistQuiz`), `PublicQuestion` (ids, no `isCorrect`). Later stages derive from earlier stages with Zod `extend` and `omit`. Postgres mints the ids; the LLM never does. Spec: `docs/superpowers/specs/2026-08-07-canonical-quiz-model-design.md`.

**Tech Stack:** TypeScript strict, Zod 4 (`import { z } from "zod/v4"`), LangGraph JS, Prisma 7, Vitest, pnpm workspace.

## Global Constraints

- AGENTS.md hard rule 1: never throw inside the interrupt loop. Invalid input becomes a re-prompt with a reason.
- AGENTS.md hard rule 2: `isCorrect` never leaves the server. Strip it from every interrupt payload.
- AGENTS.md hard rule 3: scoring is a pure function. No I/O, no persistence imports in `ScoringService`.
- AGENTS.md hard rule 5 is not triggered: the generation prompt and the structured output schema stay semantically identical, so no eval run is required.
- Scoring tests are the floor. Their scenarios stay; only literals change.
- Comments and docs in Simplified Technical English. No em dashes.
- Conventional commits with scopes `agent`, `scoring`, `evals`.
- Do not touch `server/spike/langgraph-spike.ts`. It defines its own state.
- `pnpm --filter server typecheck` goes red at Task 3 and comes back at Task 6. Each task still ends with its own green vitest run (vitest transpiles with swc and does not typecheck). Task 6 and Task 7 end with full repo gates.

## Test Commands

- One server spec file: `pnpm --filter server exec vitest run <path relative to server/>`
- Shared package tests: `pnpm --filter @quizforge/shared test`
- Evals tests: `pnpm --filter @quizforge/evals test`
- Full gates: `pnpm test` and `pnpm -r typecheck` from the repo root.

---

### Task 1: The canonical quiz model in `shared`

**Files:**
- Modify: `shared/package.json`
- Create: `shared/src/quiz.ts`
- Create: `shared/src/quiz.spec.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (every later task imports from `@quizforge/shared`): `QuestionTypeSchema`, `QuestionType`; `DraftOptionSchema`, `DraftOption`; `DraftQuestionSchema`, `DraftQuestion`; `DraftQuizSchema`, `DraftQuiz`; `OptionSchema`, `Option`; `QuestionSchema`, `Question`; `QuizSchema`, `Quiz`; `PublicOptionSchema`, `PublicOption`; `PublicQuestionSchema`, `PublicQuestion`; `AskQuestionPayloadSchema`, `AskQuestionPayload`; `ResumeSchema`, `Resume`; `AnswersSchema`, `Answers`; `ScoresSchema`, `Scores`.

- [ ] **Step 1: Add zod to `shared`**

In `shared/package.json`, add a `dependencies` block. Keep every other field, including `"type": "module"` (the current cross-package resolution typechecks green; do not disturb it):

```json
  "dependencies": {
    "zod": "4.4.3"
  },
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `shared/src/quiz.spec.ts`. The shared package has no vitest globals, so import from `vitest`:

```ts
import { describe, expect, it } from "vitest";
import {
  AnswersSchema,
  DraftQuizSchema,
  PublicQuestionSchema,
  QuizSchema,
  ResumeSchema,
} from "./quiz";

const OPTION_ID = "00000000-0000-4000-8000-200000000000";
const OPTION_ID_2 = "00000000-0000-4000-8000-200000000001";
const QUESTION_ID = "00000000-0000-4000-8000-100000000000";
const QUIZ_ID = "00000000-0000-4000-8000-000000000000";

const draft = {
  title: "t",
  questions: [
    {
      text: "q",
      type: "single",
      // Three options on purpose: the draft shapes carry no size bounds.
      options: [
        { text: "a", isCorrect: true },
        { text: "b", isCorrect: false },
        { text: "c", isCorrect: false },
      ],
    },
  ],
};

describe("DraftQuizSchema", () => {
  it("accepts a draft without ids and without size bounds", () => {
    expect(DraftQuizSchema.safeParse(draft).success).toBe(true);
  });
});

describe("QuizSchema", () => {
  it("rejects a draft, because the canonical quiz requires ids", () => {
    expect(QuizSchema.safeParse(draft).success).toBe(false);
  });

  it("accepts a quiz with uuids on every level", () => {
    const quiz = {
      id: QUIZ_ID,
      title: "t",
      questions: [
        {
          id: QUESTION_ID,
          text: "q",
          type: "multi",
          options: [
            { id: OPTION_ID, text: "a", isCorrect: true },
            { id: OPTION_ID_2, text: "b", isCorrect: true },
          ],
        },
      ],
    };
    expect(QuizSchema.safeParse(quiz).success).toBe(true);
  });
});

describe("PublicQuestionSchema", () => {
  it("strips isCorrect on parse", () => {
    const parsed = PublicQuestionSchema.parse({
      id: QUESTION_ID,
      text: "q",
      type: "single",
      options: [{ id: OPTION_ID, text: "a", isCorrect: true }],
    });
    expect(JSON.stringify(parsed)).not.toContain("isCorrect");
  });
});

describe("ResumeSchema", () => {
  it("accepts 1 to 4 unique option ids", () => {
    const parsed = ResumeSchema.safeParse({
      selections: [OPTION_ID, OPTION_ID_2],
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    { label: "an empty selection", selections: [] },
    { label: "a duplicate id", selections: [OPTION_ID, OPTION_ID] },
    { label: "a non-uuid string", selections: ["2"] },
    { label: "a number", selections: [2] },
  ])("rejects $label", ({ selections }) => {
    expect(ResumeSchema.safeParse({ selections }).success).toBe(false);
  });
});

describe("AnswersSchema", () => {
  it("accepts a record from question id to option ids", () => {
    const parsed = AnswersSchema.safeParse({
      [QUESTION_ID]: [OPTION_ID, OPTION_ID_2],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid key", () => {
    expect(AnswersSchema.safeParse({ "0": [OPTION_ID] }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @quizforge/shared test`
Expected: FAIL, `./quiz` does not exist.

- [ ] **Step 4: Create `shared/src/quiz.ts`**

```ts
import { z } from "zod/v4";

/**
 * The canonical quiz model. The quiz passes through named stages:
 * DraftQuiz (LLM output, no ids), Quiz (database ids), PublicQuestion
 * (ids, no isCorrect). Later stages derive from earlier stages.
 */

export const QuestionTypeSchema = z.enum(["single", "multi"]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const DraftOptionSchema = z.object({
  text: z.string().describe("The text of the option"),
  isCorrect: z.boolean().describe("Whether the option is correct"),
});
export type DraftOption = z.infer<typeof DraftOptionSchema>;

export const DraftQuestionSchema = z.object({
  text: z.string().describe("The text of the question"),
  type: QuestionTypeSchema.describe("The type of the question"),
  options: z.array(DraftOptionSchema).describe("The options for the question"),
});
export type DraftQuestion = z.infer<typeof DraftQuestionSchema>;

// The size bounds (4 options, 5 to 8 questions) do not live here. They
// are the generation contract and stay in the server GeneratedQuizSchema,
// so evals can parse a structurally bad quiz and report on it.
export const DraftQuizSchema = z.object({
  title: z.string().describe("The title of the quiz"),
  description: z.string().optional().describe("The description of the quiz"),
  questions: z
    .array(DraftQuestionSchema)
    .describe("The questions in the quiz"),
});
export type DraftQuiz = z.infer<typeof DraftQuizSchema>;

// The database mints the ids. The LLM never does.
export const OptionSchema = DraftOptionSchema.extend({ id: z.uuid() });
export type Option = z.infer<typeof OptionSchema>;

export const QuestionSchema = DraftQuestionSchema.extend({
  id: z.uuid(),
  options: z.array(OptionSchema),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuizSchema = DraftQuizSchema.extend({
  id: z.uuid(),
  questions: z.array(QuestionSchema),
});
export type Quiz = z.infer<typeof QuizSchema>;

// Correct answers never leave the server (AGENTS.md hard rule 2). The
// public shapes omit isCorrect and are the only question shapes that
// cross the wire.
export const PublicOptionSchema = OptionSchema.omit({ isCorrect: true });
export type PublicOption = z.infer<typeof PublicOptionSchema>;

export const PublicQuestionSchema = QuestionSchema.extend({
  options: z.array(PublicOptionSchema),
});
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;

export const AskQuestionPayloadSchema = z.object({
  question: PublicQuestionSchema,
  index: z.int().describe("Zero-based progress position, presentation only"),
  total: z.int().describe("The number of questions in the quiz"),
  reason: z
    .string()
    .optional()
    .describe("Set on re-prompt of the same question"),
});
export type AskQuestionPayload = z.infer<typeof AskQuestionPayloadSchema>;

export const ResumeSchema = z.object({
  selections: z
    .array(z.uuid())
    .min(1)
    .max(4)
    .refine((s) => new Set(s).size === s.length, "Selections must be unique")
    .describe("The selected option ids for one question"),
});
export type Resume = z.infer<typeof ResumeSchema>;

// Records keyed by question id. The key makes a second answer for one
// question structurally impossible, and no consumer can join answers to
// questions by array index.
export const AnswersSchema = z.record(z.uuid(), z.array(z.uuid()));
export type Answers = z.infer<typeof AnswersSchema>;

export const ScoresSchema = z.record(z.uuid(), z.number());
export type Scores = z.infer<typeof ScoresSchema>;
```

- [ ] **Step 5: Re-export from the package index**

Replace the body of `shared/src/index.ts` with:

```ts
// Shared domain types for quizforge. The SSE event union lands here
// with Phase 3.5 (see docs/PLAN.md).

export const SHARED_PACKAGE = "@quizforge/shared";

export * from "./quiz";
```

`SHARED_PACKAGE` stays: `server/src/app.controller.ts` imports it.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @quizforge/shared test`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @quizforge/shared typecheck && pnpm --filter server typecheck`
Expected: both green. Server is untouched but proves resolution still works.

- [ ] **Step 8: Commit**

```bash
git add shared/package.json shared/src pnpm-lock.yaml
git commit -m "feat: add the canonical quiz model to shared"
```

---

### Task 2: Scoring on string option ids, one type spelling

**Files:**
- Modify: `server/src/scoring/scoring.types.ts`
- Modify: `server/src/scoring/scoring.service.ts`
- Modify: `server/src/scoring/scoring.service.spec.ts`

**Interfaces:**
- Consumes: `QuestionType` from `@quizforge/shared`.
- Produces: `ScorableQuestion` with `type: QuestionType` (values `"single" | "multi"`) and `correctOptionIds`/`allOptionIds` as `ReadonlySet<string>`. `ScoringService.scoreQuestion(question, answerOptionIds: ReadonlySet<string>)` unchanged in behavior. Task 6 consumes this.

Note: `server/src/agent/nodes/score-answers.ts` stops typechecking after this task. That is expected; Task 6 rewrites it. Its vitest suite still runs green in the interim.

- [ ] **Step 1: Update the failing tests first**

In `server/src/scoring/scoring.service.spec.ts` apply these mechanical replacements, keeping every scenario and comment:

- `type: "SINGLE"` becomes `type: "single"`; `type: "MULTI"` becomes `type: "multi"`.
- Test titles: `SINGLE` becomes `single`, `MULTI` becomes `multi`.
- Id literals become strings. The file uses two universes:
  - Sets over `[0, 1, 2]` become sets over `["a", "b", "c"]`; sets over `[0, 1, 2, 3]` become `["a", "b", "c", "d"]`.
  - `correctOptionIds: new Set([0])` becomes `new Set(["a"])`; `new Set([0, 1])` becomes `new Set(["a", "b"])`.
  - Answer sets map the same way: `new Set([1])` becomes `new Set(["b"])`, `new Set([0, 1, 2])` becomes `new Set(["a", "b", "c"])`, `[0, 1]`/`[1, 0]` become `["a", "b"]`/`["b", "a"]`.
  - The perfect-answer cases: `correct: [0]` becomes `correct: ["a"]`, `correct: [0, 1, 2]` becomes `correct: ["a", "b", "c"]`, and the foreign option in `allOptionIds: new Set([...correct, 3])` becomes `new Set([...correct, "z"])`.
  - Membership cases: `new Set([3])` becomes `new Set(["z"])` (foreign to the single question), `new Set([0, 4])` becomes `new Set(["a", "z"])`, `new Set([0, 2])` becomes `new Set(["a", "c"])`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter server exec vitest run src/scoring/scoring.service.spec.ts`
Expected: FAIL. String ids never match the numeric sets the service still expects, and `"single"` never equals `"SINGLE"`.

- [ ] **Step 3: Update `scoring.types.ts`**

Replace the file body:

```ts
import type { QuestionType } from "@quizforge/shared";

export interface ScorableQuestion {
  // The domain spelling ("single" | "multi") from shared. The Prisma
  // enum spelling exists only behind question-type-map.ts in the agent
  // package; scoring stays free of persistence.
  type: QuestionType;
  correctOptionIds: ReadonlySet<string>;
  allOptionIds: ReadonlySet<string>;
}

export interface ScoredAnswer {
  score: number; // 0..4
}
```

- [ ] **Step 4: Update `scoring.service.ts`**

In `validateAnswer` and `scoreQuestion`:
- Change both `answerOptionIds: ReadonlySet<number>` parameters to `ReadonlySet<string>`.
- Change `question.type === "SINGLE"` to `question.type === "single"` and `question.type === "MULTI"` to `question.type === "multi"`.
- Change the two cardinality messages to `"A single choice question must have exactly one answer"` and `"A multi choice question must have at least one answer"`.

The membership messages and all logic stay as they are.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter server exec vitest run src/scoring/scoring.service.spec.ts src/scoring/scoring-modes.spec.ts src/scoring/scoring-mode.provider.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/scoring
git commit -m "refactor(scoring): key scoring by option id strings and one type spelling"
```

---

### Task 3: Generation schema, state channels, `generateQuestions`, fixtures

**Files:**
- Modify: `server/src/agent/agent.schemas.ts`
- Modify: `server/src/agent/state.ts`
- Create: `server/src/agent/quiz-fixtures.ts`
- Modify: `server/src/agent/nodes/generate-questions.ts`
- Modify: `server/src/agent/nodes/generate-questions.spec.ts`
- Modify: `server/src/agent/nodes/fetch-source.spec.ts` (state literals only)

**Interfaces:**
- Consumes: draft schemas from `@quizforge/shared` (Task 1).
- Produces: `GeneratedQuizSchema` (the strict LLM contract); state channels `draft: DraftQuiz | undefined`, `quiz: Quiz | undefined`, `answers: Answers` (default `{}`), `scores: Scores` (default `{}`), `finalScore: number | undefined`; the `quizId` channel is gone. Fixture helpers `qid(q)`, `oid(q, o)`, `makeDraft()`, `makeQuiz(quizId)`, `makeDbQuiz(quizId)` for Tasks 4 to 6.
- Interim state: `graph.spec.ts` and the other node specs go red or stale here; Tasks 4 to 6 restore them. Run only the files this task names.

- [ ] **Step 1: Replace `server/src/agent/agent.schemas.ts`**

```ts
import { z } from "zod/v4";
import {
  DraftOptionSchema,
  DraftQuestionSchema,
  DraftQuizSchema,
} from "@quizforge/shared";

/**
 * The generation contract for the LLM. The draft shapes come from
 * shared; this schema adds the size bounds the generator must meet.
 * The interrupt and resume schemas live in shared.
 */
export const GeneratedQuizSchema = DraftQuizSchema.extend({
  questions: z
    .array(
      DraftQuestionSchema.extend({
        options: z
          .array(DraftOptionSchema)
          .min(4)
          .max(4)
          .describe("The options for the question"),
      }),
    )
    .min(5)
    .max(8)
    .describe("The questions in the quiz"),
});
```

`OptionSchema`, `QuestionSchema`, `QuizSchema`, `AskQuestionPayloadSchema` and `ResumeSchema` disappear from this file.

- [ ] **Step 2: Replace `server/src/agent/state.ts`**

```ts
import { StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import {
  AnswersSchema,
  DraftQuizSchema,
  QuizSchema,
  ScoresSchema,
} from "@quizforge/shared";

const QuizState = new StateSchema({
  readme_url: z.string().describe("The URL of the README file for the quiz"),
  source: z
    .string()
    .default("")
    .describe("The Markdown that fetchSource retrieved from readme_url"),
  draft: DraftQuizSchema.optional().describe(
    "The quiz that generateQuestions generated, before ids exist",
  ),
  quiz: QuizSchema.optional().describe(
    "The persisted quiz with database ids, from persistQuiz",
  ),
  answers: AnswersSchema.default({}).describe(
    "The selected option ids per question id, from askQuestion",
  ),
  scores: ScoresSchema.default({}).describe(
    "The score per question id, from scoreAnswers",
  ),
  finalScore: z
    .number()
    .optional()
    .describe("The final score for the quiz, from scoreAnswers"),
});

export { QuizState };
```

- [ ] **Step 3: Create `server/src/agent/quiz-fixtures.ts`**

Not a spec file, so vitest does not collect it.

```ts
import type { DraftQuiz, Quiz } from "@quizforge/shared";

/**
 * Deterministic quiz fixtures for the agent specs. The ids are fixed
 * valid uuids: question ids carry marker 1, option ids carry marker 2,
 * so the two can never collide.
 *
 * The correct options sit at varied positions on purpose. A mapping
 * that rebuilds ids from a filtered array produces the same sets when
 * every correct option leads its question; this fixture catches that.
 */

export function qid(q: number): string {
  return `00000000-0000-4000-8000-1${String(q).padStart(11, "0")}`;
}

export function oid(q: number, o: number): string {
  return `00000000-0000-4000-8000-2${String(q * 100 + o).padStart(11, "0")}`;
}

const QUESTIONS = [
  { text: "Question 1", type: "single", correct: [2] },
  { text: "Question 2", type: "multi", correct: [1, 3] },
  { text: "Question 3", type: "single", correct: [0] },
  { text: "Question 4", type: "multi", correct: [0, 1] },
  { text: "Question 5", type: "single", correct: [3] },
] as const;

export function makeDraft(): DraftQuiz {
  return {
    title: "hello",
    description: "this is a quiz",
    questions: QUESTIONS.map((q) => ({
      text: q.text,
      type: q.type,
      options: [0, 1, 2, 3].map((o) => ({
        text: `Option ${o + 1}`,
        isCorrect: (q.correct as readonly number[]).includes(o),
      })),
    })),
  };
}

export function makeQuiz(quizId: string): Quiz {
  const draft = makeDraft();
  return {
    id: quizId,
    title: draft.title,
    description: draft.description,
    questions: draft.questions.map((q, qi) => ({
      id: qid(qi),
      text: q.text,
      type: q.type,
      options: q.options.map((o, oi) => ({
        id: oid(qi, oi),
        text: o.text,
        isCorrect: o.isCorrect,
      })),
    })),
  };
}

/** The row shape prisma.quiz.create returns with the nested include. */
export function makeDbQuiz(quizId: string) {
  const draft = makeDraft();
  return {
    id: quizId,
    sourceUrl: "https://raw.githubusercontent.com/owner/repo/main/README.md",
    title: draft.title,
    description: draft.description ?? null,
    strategy: "todo",
    model: "todo",
    createdAt: new Date(),
    questions: draft.questions.map((q, qi) => ({
      id: qid(qi),
      quizId,
      position: qi,
      type: q.type === "single" ? ("SINGLE" as const) : ("MULTI" as const),
      text: q.text,
      options: q.options.map((o, oi) => ({
        id: oid(qi, oi),
        questionId: qid(qi),
        position: oi,
        text: o.text,
        isCorrect: o.isCorrect,
      })),
    })),
  };
}
```

- [ ] **Step 4: Update the failing test**

In `server/src/agent/nodes/generate-questions.spec.ts`:

- Delete the `import type { QuizSchema } ...` line and the `import { z } from "zod/v4";` line. The fixture below replaces the only `z.infer` usage, so neither import survives.
- Add `import { makeDraft } from "../quiz-fixtures";` and delete the whole inline `fakeQuiz` literal; use `const fakeQuiz = makeDraft();`.
- Replace the state literal:

```ts
const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  draft: undefined,
  quiz: undefined,
  answers: {},
  scores: {},
  finalScore: undefined,
};
```

- Replace every `result.quiz` assertion with `result.draft`:

```ts
    assert.isDefined(result.draft);
    assert.equal(result.draft.title, fakeQuiz.title);
    assert.equal(result.draft.description, fakeQuiz.description);
```

and in the repair-round test:

```ts
    assert.isDefined(result.draft);
    assert.equal(result.draft.title, "hello");
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run src/agent/nodes/generate-questions.spec.ts`
Expected: FAIL, the node still returns `{ quiz }`.

- [ ] **Step 6: Update `generate-questions.ts`**

- Replace `import { QuizSchema } from "../agent.schemas";` with `import { GeneratedQuizSchema } from "../agent.schemas";`.
- `const model = llm.withStructuredOutput(GeneratedQuizSchema);`
- `return { draft: GeneratedQuizSchema.parse(result) };`

Prompt text and retry logic stay untouched (hard rule 5 stays dormant).

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter server exec vitest run src/agent/nodes/generate-questions.spec.ts`
Expected: PASS.

- [ ] **Step 8: Update the `fetch-source.spec.ts` state literals**

Two inline state objects (near lines 175 and 200) contain `quizId: undefined,` and `answers: [],`. In both, replace `quizId: undefined,` with `draft: undefined,` and `answers: [],` with `answers: {},`, and replace `scores: [],` with `scores: {},` where present. Keep `quiz: undefined`.

Run: `pnpm --filter server exec vitest run src/agent/nodes/fetch-source.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/agent
git commit -m "refactor(agent): generate a draft quiz and stage the state channels"
```

---

### Task 4: `persistQuiz` returns the quiz with database ids

**Files:**
- Create: `server/src/agent/question-type-map.ts`
- Create: `server/src/agent/question-type-map.spec.ts`
- Modify: `server/src/agent/nodes/persist-quiz.ts`
- Modify: `server/src/agent/nodes/persist-quiz.spec.ts`

**Interfaces:**
- Consumes: `state.draft` (Task 3), `Quiz` from shared, fixtures from `server/src/agent/quiz-fixtures.ts`.
- Produces: `toDbQuestionType(type: QuestionType): "SINGLE" | "MULTI"` and `fromDbQuestionType(type: "SINGLE" | "MULTI"): QuestionType`; the node returns `{ quiz: Quiz }` (or `{}` when `state.quiz` already exists). Task 6 relies on `state.quiz` carrying ids.

- [ ] **Step 1: Write the failing type-map test**

Create `server/src/agent/question-type-map.spec.ts`:

```ts
import { fromDbQuestionType, toDbQuestionType } from "./question-type-map";

describe("question-type-map", () => {
  it.each([
    { domain: "single", db: "SINGLE" },
    { domain: "multi", db: "MULTI" },
  ] as const)("round-trips $domain", ({ domain, db }) => {
    expect(toDbQuestionType(domain)).toBe(db);
    expect(fromDbQuestionType(db)).toBe(domain);
  });
});
```

Run: `pnpm --filter server exec vitest run src/agent/question-type-map.spec.ts`
Expected: FAIL, module does not exist.

- [ ] **Step 2: Create `server/src/agent/question-type-map.ts`**

```ts
import type { QuestionType } from "@quizforge/shared";

/**
 * The only translation between the domain spelling ("single") and the
 * Prisma enum spelling ("SINGLE"). Only code that touches Prisma
 * imports this module.
 */

const TO_DB = { single: "SINGLE", multi: "MULTI" } as const;

export type DbQuestionType = (typeof TO_DB)[QuestionType];

const FROM_DB = { SINGLE: "single", MULTI: "multi" } as const satisfies Record<
  DbQuestionType,
  QuestionType
>;

export function toDbQuestionType(type: QuestionType): DbQuestionType {
  return TO_DB[type];
}

export function fromDbQuestionType(type: DbQuestionType): QuestionType {
  return FROM_DB[type];
}
```

Run: `pnpm --filter server exec vitest run src/agent/question-type-map.spec.ts`
Expected: PASS.

- [ ] **Step 3: Rewrite the failing node spec**

Replace `server/src/agent/nodes/persist-quiz.spec.ts` with:

```ts
import { CommandInstance } from "@langchain/langgraph";
import { makePersistQuizNode } from "./persist-quiz";
import { QuizState } from "../state";
import { makePrismaMock } from "../../common/testing";
import { InvalidStateError, PersistQuizError } from "../../common/errors";
import { makeDbQuiz, makeDraft, makeQuiz } from "../quiz-fixtures";

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  draft: makeDraft(),
  quiz: undefined,
  answers: {},
  scores: {},
  finalScore: undefined,
};

describe("persistQuizNode", () => {
  it("persists the draft and returns the quiz with database ids", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    prisma.quiz.create.mockResolvedValue(makeDbQuiz(quizId) as never);

    // ACT:
    const result = await makePersistQuizNode(prisma)(state, {} as never);

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result).toEqual({ quiz: makeQuiz(quizId) });

    expect(prisma.quiz.create).toHaveBeenCalledWith({
      data: {
        sourceUrl:
          "https://raw.githubusercontent.com/owner/repo/main/README.md",
        title: "hello",
        description: "this is a quiz",
        strategy: "todo",
        model: "todo",
        questions: {
          create: makeDraft().questions.map((q, qi) => ({
            position: qi,
            text: q.text,
            type: q.type === "single" ? "SINGLE" : "MULTI",
            options: {
              create: q.options.map((o, oi) => ({
                position: oi,
                text: o.text,
                isCorrect: o.isCorrect,
              })),
            },
          })),
        },
      },
      include: {
        questions: {
          orderBy: { position: "asc" },
          include: { options: { orderBy: { position: "asc" } } },
        },
      },
    });
  });

  it("is idempotent once the quiz is in state", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithQuiz = { ...state, quiz: makeQuiz(crypto.randomUUID()) };

    // ACT:
    const result = await makePersistQuizNode(prisma)(
      stateWithQuiz,
      {} as never,
    );

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result).toEqual({});
    expect(prisma.quiz.create).not.toHaveBeenCalled();
  });

  it("throws when the draft is not in the state", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const stateWithoutDraft = { ...state, draft: undefined };

    // ACT & ASSERT:
    await expect(
      makePersistQuizNode(prisma)(stateWithoutDraft, {} as never),
    ).rejects.toThrowError(InvalidStateError);
  });

  it("throws when there is an error persisting the quiz", async () => {
    // ARRANGE:
    const prisma = makePrismaMock();
    const dbError = new Error("Database error");
    prisma.quiz.create.mockRejectedValue(dbError);

    // ACT:
    const promise = makePersistQuizNode(prisma)(state, {} as never);

    // ASSERT: class, message, and preserved cause each checked on their own.
    // toThrowError(new PersistQuizError(...)) compares only the message.
    await expect(promise).rejects.toBeInstanceOf(PersistQuizError);
    await expect(promise).rejects.toMatchObject({
      message: "Quiz could not be saved: Database error",
      cause: dbError,
    });
  });
});
```

Run: `pnpm --filter server exec vitest run src/agent/nodes/persist-quiz.spec.ts`
Expected: FAIL, the node still reads `state.quiz` as the draft and returns `{ quizId }`.

- [ ] **Step 4: Rewrite `persist-quiz.ts`**

```ts
import type { GraphNode } from "@langchain/langgraph";
import type { Quiz } from "@quizforge/shared";
import { PrismaClient } from "../../generated/prisma/client";
import { PersistQuizError, InvalidStateError } from "../../common/errors";
import { QuizState } from "../state";
import { fromDbQuestionType, toDbQuestionType } from "../question-type-map";

export function makePersistQuizNode(
  prisma: PrismaClient,
): GraphNode<typeof QuizState> {
  return async (state) => {
    if (state.quiz) {
      // The quiz is already persisted, so leave the state unchanged.
      // This guard only helps when the checkpoint after this node was
      // saved. A crash between the create and that checkpoint writes a
      // duplicate quiz on replay. We accept that window in this demo.
      return {};
    }

    if (!state.draft) {
      throw new InvalidStateError("Missing required state property: draft");
    }

    try {
      // TODO: fill missing fields
      const created = await prisma.quiz.create({
        data: {
          sourceUrl: state.readme_url,
          title: state.draft.title,
          description: state.draft.description,
          strategy: "todo",
          model: "todo",
          questions: {
            create: state.draft.questions.map((q, qi) => ({
              position: qi,
              text: q.text,
              type: toDbQuestionType(q.type),
              options: {
                create: q.options.map((o, oi) => ({
                  position: oi,
                  text: o.text,
                  isCorrect: o.isCorrect,
                })),
              },
            })),
          },
        },
        // The read-back carries the database ids. The explicit orderBy
        // keeps the generation order; Prisma does not guarantee one.
        include: {
          questions: {
            orderBy: { position: "asc" },
            include: { options: { orderBy: { position: "asc" } } },
          },
        },
      });

      const quiz: Quiz = {
        id: created.id,
        title: created.title,
        description: created.description ?? undefined,
        questions: created.questions.map((q) => ({
          id: q.id,
          text: q.text,
          type: fromDbQuestionType(q.type),
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
          })),
        })),
      };

      return { quiz };
    } catch (error) {
      throw new PersistQuizError(
        `Quiz could not be saved: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter server exec vitest run src/agent/nodes/persist-quiz.spec.ts src/agent/question-type-map.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/agent
git commit -m "feat(agent): return the persisted quiz with database ids"
```

---

### Task 5: `askQuestion` collects answers by option id

**Files:**
- Modify: `server/src/agent/nodes/ask-question.ts`
- Modify: `server/src/agent/nodes/ask-question.spec.ts`

**Interfaces:**
- Consumes: `state.quiz` with ids (Task 4), `AskQuestionPayload`, `Answers`, `ResumeSchema` from shared, fixtures `makeQuiz`, `qid`, `oid`.
- Produces: `{ answers: Answers }`, a record keyed by question id. Interrupt payload questions carry option ids and never `isCorrect`. Re-prompt reasons: `Invalid response: ...` (schema), `Unknown option id for this question.` (membership), `Select exactly one option.` (single cardinality).

- [ ] **Step 1: Rewrite the failing spec**

Replace `server/src/agent/nodes/ask-question.spec.ts` with:

```ts
import { interrupt } from "@langchain/langgraph";
import { AskQuestionPayloadSchema } from "@quizforge/shared";
import { QuizState } from "../state";
import { makeQuiz, oid, qid } from "../quiz-fixtures";
import { makeAskQuestionNode } from "./ask-question";

// interrupt() only runs inside a graph, so the test replaces it. The mock is
// partial: everything else stays real, because QuizState needs StateSchema
// from the same module.
vi.mock("@langchain/langgraph", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langchain/langgraph")>()),
  interrupt: vi.fn(),
}));

const interruptMock = vi.mocked(interrupt);

/**
 * Scripts the resume values that interrupt returns, one per call. When the
 * script runs out the mock throws, which mirrors the real behaviour: an
 * unanswered interrupt pauses the node by throwing GraphInterrupt.
 *
 * Returns the payloads as deep copies taken at call time. The node mutates
 * and reuses one payload object per question, so the references stored in
 * interruptMock.mock.calls all show the final state, not the sequence.
 */
function scriptInterrupt(resumes: unknown[]) {
  const queue = [...resumes];
  const seen: unknown[] = [];
  interruptMock.mockImplementation((payload) => {
    seen.push(structuredClone(payload));
    if (queue.length === 0) {
      throw new Error("script exhausted: the node would pause here");
    }
    return queue.shift();
  });
  return seen;
}

beforeEach(() => {
  interruptMock.mockReset();
});

const QUIZ_ID = "412438f7-b949-41d0-aaae-6387d5bc9291";

// One valid selection per question: the first option for a single
// question, the first two options for a multi question.
const validResumes = [
  { selections: [oid(0, 0)] },
  { selections: [oid(1, 0), oid(1, 1)] },
  { selections: [oid(2, 2)] },
  { selections: [oid(3, 1), oid(3, 3)] },
  { selections: [oid(4, 3)] },
];

const validAnswers = {
  [qid(0)]: [oid(0, 0)],
  [qid(1)]: [oid(1, 0), oid(1, 1)],
  [qid(2)]: [oid(2, 2)],
  [qid(3)]: [oid(3, 1), oid(3, 3)],
  [qid(4)]: [oid(4, 3)],
};

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  draft: undefined,
  quiz: makeQuiz(QUIZ_ID),
  answers: {},
  scores: {},
  finalScore: undefined,
};

describe("askQuestionNode", () => {
  it("collects one answer per question, keyed by question id", () => {
    // ARRANGE:
    const seen = scriptInterrupt([...validResumes]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(5);

    // Observe the payloads: question order, ids present, no isCorrect.
    // Parsing doubles as an assertion that every payload matches the schema.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
    expect(payloads.map((p) => p.question.id)).toEqual(
      [0, 1, 2, 3, 4].map(qid),
    );
    expect(payloads.every((p) => p.reason === undefined)).toBe(true);
    expect(JSON.stringify(payloads)).not.toContain("isCorrect");
  });

  it("throws InvalidStateError if state.quiz is missing", () => {
    // ARRANGE:
    const stateWithoutQuiz = { ...state, quiz: undefined };

    // ACT & ASSERT:
    expect(() => makeAskQuestionNode()(stateWithoutQuiz, {} as never)).toThrow(
      "Missing required state property: quiz",
    );
  });

  it("re-interrupts if the answer schema is invalid, with a reason", () => {
    // ARRANGE: option indices are the old wire contract and fail the
    // uuid schema; the node must re-prompt, never throw.
    const seen = scriptInterrupt([
      { selections: [0] }, // invalid: a number is not an option id
      ...validResumes,
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    // The first ask carries no reason; the re-ask of the same question does.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[0].reason).toBeUndefined();
    expect(payloads[1].index).toBe(0);
    expect(payloads[1].reason).toContain("Invalid response:");
  });

  it("re-interrupts on an option id from another question, with a reason", () => {
    // ARRANGE: a well-formed uuid that belongs to question 2, offered
    // as an answer to question 1.
    const seen = scriptInterrupt([
      { selections: [oid(1, 0)] },
      ...validResumes,
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[1].index).toBe(0);
    expect(payloads[1].reason).toBe("Unknown option id for this question.");
  });

  it("re-interrupts if a single question gets more than 1 answer, with a reason", () => {
    // ARRANGE:
    const seen = scriptInterrupt([
      { selections: [oid(0, 0), oid(0, 1)] }, // invalid: question 1 is single
      ...validResumes,
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[0].reason).toBeUndefined();
    expect(payloads[1].index).toBe(0);
    expect(payloads[1].reason).toContain("Select exactly one option.");
  });

  it("re-interrupts if duplicate selections have been provided", () => {
    // ARRANGE:
    const seen = scriptInterrupt([
      { selections: [oid(0, 0)] }, // valid for question 1
      { selections: [oid(1, 1), oid(1, 1)] }, // invalid: duplicate id
      { selections: [oid(1, 0), oid(1, 1)] }, // valid for question 2
      ...validResumes.slice(2),
    ]);

    // ACT:
    const result = makeAskQuestionNode()(state, {} as never);

    // ASSERT:
    expect(result).toEqual({ answers: validAnswers });
    expect(interruptMock).toHaveBeenCalledTimes(6);

    // Question 2's first ask carries no reason; its re-ask does.
    const payloads = seen.map((p) => AskQuestionPayloadSchema.parse(p));
    expect(payloads[1].reason).toBeUndefined();
    expect(payloads[2].index).toBe(1);
    expect(payloads[2].reason).toContain("Selections must be unique");
  });

  it("throws if the interrupt mock runs out of scripted resumes", () => {
    // ARRANGE:
    scriptInterrupt([{ selections: [oid(0, 0)] }]); // only one resume scripted

    // ACT & ASSERT:
    expect(() => makeAskQuestionNode()(state, {} as never)).toThrow(
      "script exhausted: the node would pause here",
    );
  });
});
```

Run: `pnpm --filter server exec vitest run src/agent/nodes/ask-question.spec.ts`
Expected: FAIL, the node still collects index arrays.

- [ ] **Step 2: Rewrite `ask-question.ts`**

```ts
import { GraphNode, interrupt } from "@langchain/langgraph";
import {
  ResumeSchema,
  type Answers,
  type AskQuestionPayload,
} from "@quizforge/shared";
import { z } from "zod/v4";
import { InvalidStateError } from "../../common/errors";
import { QuizState } from "../state";

export function makeAskQuestionNode(): GraphNode<typeof QuizState> {
  return (state) => {
    if (!state.quiz) {
      throw new InvalidStateError("Missing required state property: quiz");
    }

    const answers: Answers = {};

    for (let i = 0; i < state.quiz.questions.length; i++) {
      const question = state.quiz.questions[i];
      const validIds = new Set(question.options.map((o) => o.id));

      const payload: AskQuestionPayload = {
        question: {
          id: question.id,
          text: question.text,
          type: question.type,
          // Strip the isCorrect field from the options
          options: question.options.map(({ id, text }) => ({ id, text })),
        },
        index: i,
        total: state.quiz.questions.length,
      };

      while (true) {
        const raw: unknown = interrupt(payload);
        const parsed = ResumeSchema.safeParse(raw);
        if (!parsed.success) {
          payload.reason = `Invalid response: ${z.prettifyError(parsed.error)}`;
          continue;
        }

        const { selections } = parsed.data;

        // Membership stays an inline lookup: ScoringService also checks
        // it, but the service throws and this loop must never throw. A
        // stale submit for another question fails here and re-prompts.
        if (!selections.every((id) => validIds.has(id))) {
          payload.reason = "Unknown option id for this question.";
          continue;
        }

        if (question.type === "single" && selections.length !== 1) {
          payload.reason = "Select exactly one option.";
          continue;
        }

        answers[question.id] = selections;
        break;
      }
    }

    return { answers };
  };
}
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm --filter server exec vitest run src/agent/nodes/ask-question.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/agent/nodes/ask-question.ts server/src/agent/nodes/ask-question.spec.ts
git commit -m "feat(agent): ask questions and collect answers by option id"
```

---

### Task 6: `scoreAnswers` by question id, journey test, full server gate

**Files:**
- Modify: `server/src/agent/nodes/score-answers.ts`
- Modify: `server/src/agent/nodes/score-answers.spec.ts`
- Modify: `server/src/agent/graph.spec.ts`

**Interfaces:**
- Consumes: `state.quiz` (ids), `state.answers` (record), `ScorableQuestion` with string sets (Task 2), `Scores` from shared, fixtures.
- Produces: `{ scores: Scores, finalScore: number }`. `scoreAnswers` iterates `quiz.questions` for the weight order; `quiz.questions` is the only order source in the app.

- [ ] **Step 1: Rewrite the failing node spec**

Replace `server/src/agent/nodes/score-answers.spec.ts` with:

```ts
import { CommandInstance } from "@langchain/langgraph";
import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
} from "../../scoring/scoring-modes";
import { ScoringService } from "../../scoring/scoring.service";
import { QuizState } from "../state";
import { makeQuiz, oid, qid } from "../quiz-fixtures";
import { makeScoreAnswersNode } from "./score-answers";

const QUIZ_ID = "412438f7-b949-41d0-aaae-6387d5bc9291";

// The fixture puts the correct options at varied positions: question 1
// has correct option index 2, question 2 has 1 and 3, question 3 has 0,
// question 4 has 0 and 1, question 5 has 3. Every answer here is correct.
const correctAnswers = {
  [qid(0)]: [oid(0, 2)],
  [qid(1)]: [oid(1, 1), oid(1, 3)],
  [qid(2)]: [oid(2, 0)],
  [qid(3)]: [oid(3, 0), oid(3, 1)],
  [qid(4)]: [oid(4, 3)],
};

const state: typeof QuizState.State = {
  readme_url: "https://raw.githubusercontent.com/owner/repo/main/README.md",
  source: "This is a test.",
  draft: undefined,
  quiz: makeQuiz(QUIZ_ID),
  answers: correctAnswers,
  scores: {},
  finalScore: undefined,
};

describe("scoreAnswersNode", () => {
  const strategy =
    MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.SCALED]; // Scaled ensures that correct multi-choice answers are scored as 4, which is what we want for this test.

  it("scores answers correctly using the scoring service", async () => {
    // ARRANGE:
    const scoringService = new ScoringService(strategy);

    // ACT:
    const result = await makeScoreAnswersNode(scoringService)(
      state,
      {} as never,
    );

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result.scores).toEqual({
      [qid(0)]: 4,
      [qid(1)]: 4,
      [qid(2)]: 4,
      [qid(3)]: 4,
      [qid(4)]: 4,
    });
    expect(result.finalScore).toEqual(4);
  });

  it("scores wrong answers as 0 and partial multi answers proportionally", async () => {
    // ARRANGE:
    const scoringService = new ScoringService(strategy);
    const stateWithMixedAnswers = {
      ...state,
      answers: {
        [qid(0)]: [oid(0, 1)], // wrong: correct is option 3
        [qid(1)]: [oid(1, 1)], // partial: 1 of the 2 correct options
        [qid(2)]: [oid(2, 0)], // correct
        [qid(3)]: [oid(3, 2), oid(3, 3)], // wrong: correct is 1 and 2
        [qid(4)]: [oid(4, 3)], // correct
      },
    };

    // ACT:
    const result = await makeScoreAnswersNode(scoringService)(
      stateWithMixedAnswers,
      {} as never,
    );

    // ASSERT:
    assert.notInstanceOf(result, CommandInstance);
    expect(result.scores).toEqual({
      [qid(0)]: 0,
      [qid(1)]: 2,
      [qid(2)]: 4,
      [qid(3)]: 0,
      [qid(4)]: 4,
    });
    // Weighted average over the question order, weights 1.1^index:
    // (0 + 2*1.1 + 4*1.21 + 0 + 4*1.4641) / 6.1051
    expect(result.finalScore).toBeCloseTo(2.1124, 3);
  });

  it("throws an InvalidStateError if the quiz is missing", () => {
    const scoringService = new ScoringService(strategy);
    const invalidState = { ...state, quiz: undefined };

    expect(() =>
      makeScoreAnswersNode(scoringService)(invalidState, {} as never),
    ).toThrowError("Quiz data is missing.");
  });

  it("throws an InvalidStateError if an answer is missing", () => {
    const scoringService = new ScoringService(strategy);
    // Only 2 of the 5 questions have an answer.
    const invalidState = {
      ...state,
      answers: { [qid(0)]: [oid(0, 2)], [qid(1)]: [oid(1, 1), oid(1, 3)] },
    };

    expect(() =>
      makeScoreAnswersNode(scoringService)(invalidState, {} as never),
    ).toThrowError("Answers are missing or incomplete.");
  });
});
```

Run: `pnpm --filter server exec vitest run src/agent/nodes/score-answers.spec.ts`
Expected: FAIL, the node still zips parallel arrays.

- [ ] **Step 2: Rewrite `score-answers.ts`**

```ts
import { GraphNode } from "@langchain/langgraph";
import type { Scores } from "@quizforge/shared";
import { QuizState } from "../state";
import { ScoringService } from "../../scoring/scoring.service";
import type { ScorableQuestion } from "../../scoring/scoring.types";
import { InvalidStateError } from "../../common/errors";

export function makeScoreAnswersNode(
  scoringService: ScoringService,
): GraphNode<typeof QuizState> {
  return (state) => {
    if (!state.quiz) {
      throw new InvalidStateError("Quiz data is missing.");
    }

    // Answers join to questions by id, never by position. Only the
    // weight order below comes from the question order.
    if (!state.quiz.questions.every((q) => state.answers[q.id])) {
      throw new InvalidStateError("Answers are missing or incomplete.");
    }

    const scores: Scores = {};
    const weighted: { score: number }[] = [];
    for (const question of state.quiz.questions) {
      const scorableQuestion: ScorableQuestion = {
        type: question.type,
        correctOptionIds: new Set(
          question.options.flatMap((o) => (o.isCorrect ? [o.id] : [])),
        ),
        allOptionIds: new Set(question.options.map((o) => o.id)),
      };

      const scoredAnswer = scoringService.scoreQuestion(
        scorableQuestion,
        new Set(state.answers[question.id]),
      );
      scores[question.id] = scoredAnswer.score;
      weighted.push({ score: scoredAnswer.score });
    }

    const finalScore = scoringService.finalScore(weighted);

    return { scores, finalScore };
  };
}
```

Run: `pnpm --filter server exec vitest run src/agent/nodes/score-answers.spec.ts`
Expected: PASS.

- [ ] **Step 3: Rewrite the journey spec**

Replace `server/src/agent/graph.spec.ts` with:

```ts
import { FakeListChatModel } from "@langchain/core/utils/testing";
import {
  Command,
  INTERRUPT,
  isInterrupted,
  MemorySaver,
} from "@langchain/langgraph";
import { AskQuestionPayloadSchema } from "@quizforge/shared";
import { buildQuizGraph } from "./graph";
import { makeDbQuiz, makeDraft, makeQuiz, oid, qid } from "./quiz-fixtures";
import { makePrismaMock } from "../common/testing";
import { PrismaClient } from "../generated/prisma/client";
import {
  MULTIPLE_CHOICE_SCORING_STRATEGY,
  MultipleChoiceScoringMode,
} from "../scoring/scoring-modes";
import { ScoringService } from "../scoring/scoring.service";

/**
 * Journey tests. They run the compiled graph, so they cover the nodes and the
 * edges between them. Only the model and the network are substituted.
 *
 * MemorySaver keeps the real checkpoint behaviour, which interrupt() and
 * Command({ resume }) depend on, without a database.
 */

const BLOB_URL = "https://github.com/pipecat-ai/pipecat/blob/main/README.md";
const RAW_URL =
  "https://raw.githubusercontent.com/pipecat-ai/pipecat/main/README.md";

/** Answers every request with the same body. The tests never reach GitHub. */
function stubFetch(body: string) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function buildTestGraph(
  modelResponses: string[] = [],
  prisma: PrismaClient = makePrismaMock(),
) {
  return buildQuizGraph(
    new FakeListChatModel({ responses: modelResponses }),
    new MemorySaver(),
    prisma,
    new ScoringService(
      MULTIPLE_CHOICE_SCORING_STRATEGY[MultipleChoiceScoringMode.SPEC],
    ),
  );
}

let threadCount = 0;

/** A fresh thread per run, so one test cannot resume another test's state. */
function newThread() {
  threadCount += 1;
  return { configurable: { thread_id: `journey-${threadCount}` } };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the quiz graph", () => {
  const fakeDraft = makeDraft();

  // The correct option ids per question, from the fixture layout:
  // single questions take their one correct option, multi questions
  // take both correct options.
  const correctSelections = [
    [oid(0, 2)],
    [oid(1, 1), oid(1, 3)],
    [oid(2, 0)],
    [oid(3, 0), oid(3, 1)],
    [oid(4, 3)],
  ];

  it("converts the url, fetches the source, generates the questions, persists the quiz, collects answers, scores them, and puts everything in the state", async () => {
    // ARRANGE:
    stubFetch("# Title");
    const prisma = makePrismaMock();
    const quizId = crypto.randomUUID();
    prisma.quiz.create.mockResolvedValue(makeDbQuiz(quizId) as never);
    const graph = buildTestGraph([JSON.stringify(fakeDraft)], prisma);
    const thread = newThread();

    // ACT:
    // First stage: fetchSource -> generateQuestions -> persistQuiz
    let result = await graph.invoke({ readme_url: BLOB_URL }, thread);
    expect(prisma.quiz.create).toHaveBeenCalledOnce();
    // Second stage: askQuestion, which is a loop over the questions
    for (const [index, question] of fakeDraft.questions.entries()) {
      // Check the interrupt here to see it match the quiz questions, then post the answer to continue
      assert(isInterrupted(result));

      const payload = AskQuestionPayloadSchema.parse(
        result[INTERRUPT][0].value,
      );
      expect(payload.index).toEqual(index);
      expect(payload.question.id).toEqual(qid(index));
      expect(payload.question.text).toEqual(question.text);
      expect(payload.question.type).toEqual(question.type);
      expect(JSON.stringify(result[INTERRUPT][0].value)).not.toContain(
        "isCorrect",
      ); // Ensure the correct answer doesnt leak

      // Resume with an answer; the next invoke returns the next pause (or final state).
      result = await graph.invoke(
        new Command({ resume: { selections: correctSelections[index] } }),
        thread,
      );
    }

    // ASSERT: every answer was correct; multi questions score 2 under
    // the SPEC rule because it counts correct selections.
    expect(result).toEqual({
      readme_url: RAW_URL,
      source: "# Title",
      draft: fakeDraft,
      quiz: makeQuiz(quizId),
      answers: {
        [qid(0)]: correctSelections[0],
        [qid(1)]: correctSelections[1],
        [qid(2)]: correctSelections[2],
        [qid(3)]: correctSelections[3],
        [qid(4)]: correctSelections[4],
      },
      scores: {
        [qid(0)]: 4,
        [qid(1)]: 2,
        [qid(2)]: 4,
        [qid(3)]: 2,
        [qid(4)]: 4,
      },
      finalScore: expect.closeTo(3.2036, 3) as number,
    });
    // Still once: a resume replays only the interrupted askQuestion node,
    // never the completed persistQuiz node.
    expect(prisma.quiz.create).toHaveBeenCalledOnce();
  });

  it("requests the raw url, never the blob url", async () => {
    const fetchMock = stubFetch("# Title");
    const prisma = makePrismaMock();
    prisma.quiz.create.mockResolvedValue(
      makeDbQuiz(crypto.randomUUID()) as never,
    );

    await buildTestGraph([JSON.stringify(fakeDraft)], prisma).invoke(
      { readme_url: BLOB_URL },
      newThread(),
    );

    expect(fetchMock).toHaveBeenCalledWith(RAW_URL, expect.anything());
  });

  it("fails the run when the url is not accepted", async () => {
    const fetchMock = stubFetch("# Title");

    await expect(
      buildTestGraph().invoke(
        { readme_url: "https://example.com/README.md" },
        newThread(),
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles invalid resumes by reprompting", async () => {
    // ARRANGE:
    stubFetch("# Title");
    const prisma = makePrismaMock();
    prisma.quiz.create.mockResolvedValue(
      makeDbQuiz(crypto.randomUUID()) as never,
    );
    const graph = buildTestGraph([JSON.stringify(fakeDraft)], prisma);
    const thread = newThread();

    // ACT:
    // First stage: fetchSource -> generateQuestions -> persistQuiz
    const result = await graph.invoke({ readme_url: BLOB_URL }, thread);
    expect(prisma.quiz.create).toHaveBeenCalledOnce();
    assert(isInterrupted(result));

    // Post a malformed answer (an option index, the old wire contract).
    const invalidAnswerResult = await graph.invoke(
      new Command({ resume: { selections: [99] } }),
      thread,
    );

    // Check if we're getting the same question and a reason back.
    assert(isInterrupted(invalidAnswerResult));
    const payload = AskQuestionPayloadSchema.parse(
      invalidAnswerResult[INTERRUPT][0].value,
    );
    expect(payload.index).toEqual(0);
    expect(payload.question.text).toEqual(fakeDraft.questions[0].text);
    expect(payload.question.type).toEqual(fakeDraft.questions[0].type);
    expect(
      JSON.stringify(invalidAnswerResult[INTERRUPT][0].value),
    ).not.toContain("isCorrect"); // Ensure the correct answer doesnt leak
    expect(payload.reason).toContain("Invalid response:");

    // Post a well-formed option id that belongs to another question.
    const foreignAnswerResult = await graph.invoke(
      new Command({ resume: { selections: [oid(1, 0)] } }),
      thread,
    );

    assert(isInterrupted(foreignAnswerResult));
    const foreignPayload = AskQuestionPayloadSchema.parse(
      foreignAnswerResult[INTERRUPT][0].value,
    );
    expect(foreignPayload.index).toEqual(0);
    expect(foreignPayload.reason).toEqual(
      "Unknown option id for this question.",
    );

    // Resume with a valid answer; the next invoke returns the next pause (or final state).
    const validAnswerResult = await graph.invoke(
      new Command({ resume: { selections: [oid(0, 0)] } }),
      thread,
    );

    // Check the interrupt here to see it move to the next question.
    assert(isInterrupted(validAnswerResult));
    const validPayload = AskQuestionPayloadSchema.parse(
      validAnswerResult[INTERRUPT][0].value,
    );
    expect(validPayload.index).toEqual(1);
    expect(validPayload.question.text).toEqual(fakeDraft.questions[1].text);
    expect(validPayload.question.type).toEqual(fakeDraft.questions[1].type);
    expect(validPayload.reason).toBeUndefined(); // No reason for valid answer
  });
});
```

- [ ] **Step 4: Run the full server suite**

Run: `pnpm --filter server test`
Expected: PASS, every spec.

- [ ] **Step 5: Server and shared typecheck gate**

Run: `pnpm --filter server typecheck && pnpm --filter @quizforge/shared typecheck`
Expected: green. The evals typecheck stays red until Task 7.

- [ ] **Step 6: Commit**

```bash
git add server/src/agent
git commit -m "refactor(agent): score answers by question id and align the journey test"
```

---

### Task 7: Evals adopt the shared draft schemas

**Files:**
- Modify: `evals/package.json`
- Modify: `evals/src/quiz-shape.ts`
- Modify (rename only): `evals/src/quiz-shape.spec.ts`, `evals/src/scorecard.ts`, `evals/src/scorecard.spec.ts`, `evals/src/judge/judge.ts`, `evals/src/judge/judge.spec.ts`, `evals/src/judge/negatives.ts`
- Modify: `evals/src/scripts/run-eval.ts`

**Interfaces:**
- Consumes: `DraftQuizSchema`, `DraftQuiz`, `DraftQuestion`, `DraftOption` from `@quizforge/shared`; the `{ draft }` update from `makeGenerateQuestionsNode` (Task 3).
- Produces: `structuralFailures(quiz: DraftQuiz): string[]` unchanged in behavior. The names `EvalQuiz`, `EvalQuestion`, `EvalOption`, `EvalQuizSchema`, `EvalOptionSchema`, `EvalQuestionSchema` cease to exist.

- [ ] **Step 1: Add the dependency**

In `evals/package.json` `dependencies`, add:

```json
    "@quizforge/shared": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 2: Replace the schema block in `evals/src/quiz-shape.ts`**

Replace everything above `const MIN_QUESTIONS` with:

```ts
import {
  DraftQuizSchema,
  type DraftOption,
  type DraftQuestion,
  type DraftQuiz,
} from "@quizforge/shared";

/**
 * The eval quiz shape is the shared draft schema, which carries no size
 * bounds. The deterministic checks below stay here on purpose: they are
 * the structural contract of the eval and run outside the server
 * generation schema, so the eval can parse a structurally bad quiz and
 * report on it instead of failing the parse.
 */
export { DraftQuizSchema };
export type { DraftOption, DraftQuestion, DraftQuiz };
```

Change the `structuralFailures` signature to `structuralFailures(quiz: DraftQuiz): string[]`. The function body stays as it is.

- [ ] **Step 3: Rename across the package**

In the six files listed under Modify (rename only) plus `run-eval.ts`, apply:

- `EvalQuizSchema` becomes `DraftQuizSchema`
- `EvalQuiz` becomes `DraftQuiz`
- `EvalQuestion` becomes `DraftQuestion`
- `EvalOption` becomes `DraftOption`

Imports keep coming from `./quiz-shape.ts` (or `../quiz-shape.ts`), which now re-exports the shared names.

- [ ] **Step 4: Update the state literal in `run-eval.ts`**

The `generate(...)` call passes a full state object. Replace it with:

```ts
    generate(
      {
        readme_url: fixture.url,
        source,
        draft: undefined,
        quiz: undefined,
        answers: {},
        scores: {},
        finalScore: undefined,
      },
      {} as never,
    ),
```

And the parse line reads the new channel:

```ts
  const parsed = DraftQuizSchema.safeParse((update as { draft: unknown }).draft);
```

- [ ] **Step 5: Run the evals tests**

Run: `pnpm --filter @quizforge/evals test`
Expected: PASS.

- [ ] **Step 6: Full repo gate**

Run: `pnpm -r typecheck && pnpm test`
Expected: everything green, all packages.

- [ ] **Step 7: Commit**

```bash
git add evals pnpm-lock.yaml
git commit -m "refactor(evals): adopt the shared draft quiz schemas"
```

---

### Task 8: Documentation sync

**Files:**
- Verify: `README.md`
- Verify: `docs/PLAN.md`

**Interfaces:**
- Consumes: the finished code. Produces: docs that match it.

- [ ] **Step 1: Verify the README**

Run: `grep -n "quizId\|selectedOptionIds\|option ids\|index" README.md`

The README already documents this contract (`Command({ resume: selectedOptionIds })`, re-prompt on unknown option ids), so expect no contract edits. If any line still describes index-based answers or a `quizId` state channel, rewrite that line in Simplified Technical English to name the id contract instead.

- [ ] **Step 2: Verify `docs/PLAN.md`**

Run: `grep -n "finalize\|index" docs/PLAN.md`

The `finalize` item says the node "only writes"; that stays true and now needs no position lookup. Expect no edit. Tick no checkboxes: per Martyn's convention, PLAN.md items are ticked only after Martyn verifies them.

- [ ] **Step 3: Commit only if something changed**

```bash
git add README.md docs/PLAN.md
git commit -m "docs: align the data model wording with the id contract"
```

If the greps found nothing to change, skip the commit and report that the docs already match.
