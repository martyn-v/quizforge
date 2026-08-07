# Canonical quiz model design

Date: 2026-08-07
Status: approved in discussion, pending review of this document

## Goal

Give the app one canonical quiz model in `shared`. Replace identity by
array position with stable option and question ids. All other quiz
shapes derive from the canonical model.

The README already promises this contract. It states that the answer
arrives as `Command({ resume: selectedOptionIds })` and that unknown
option ids cause a re-prompt. The current code sends array indices.
This task aligns the code with the README.

## Problems this task removes

- Four independent quiz shapes exist: `QuizSchema` in `server`,
  `QuizState`, the Prisma models, and `EvalQuizSchema` in `evals`.
  The `shared` package is empty. This breaks the AGENTS.md rule that
  shared types live in `shared`.
- The question type has three spellings: `"single"/"multi"` in the
  agent and evals, `SINGLE/MULTI` in Prisma and in scoring. A
  `toUpperCase()` cast bridges them in `score-answers.ts`.
- Answers are option indices. The wire contract cannot detect a stale
  submit. The membership check in `ScoringService` is vacuous against
  indices 0 to 3. The future `finalize` node must map indices to
  option ids before it can write `AnswerSelection` rows.

## The model lifecycle

The quiz passes through named stages. Each stage has one type. Later
stages derive from earlier stages with Zod `extend` and `omit`.

| Stage           | Type            | Ids | `isCorrect` | Producer            |
| --------------- | --------------- | --- | ----------- | ------------------- |
| LLM draft       | `DraftQuiz`     | no  | yes         | `generateQuestions` |
| Canonical quiz  | `Quiz`          | yes | yes         | `persistQuiz`       |
| Public question | `PublicQuestion`| yes | no          | `askQuestion`       |

The LLM never mints identity. Postgres generates the uuids. The
`persistQuiz` node reads them back and builds the canonical `Quiz`.

## The `shared` package

Create `shared/src/quiz.ts` and re-export it from `shared/src/index.ts`.
Add `zod` to the dependencies of `shared` at the version the server
uses. The package is consumed as source, so consumers compile it with
their own toolchain.

Exports, all as Zod schemas with inferred types:

- `QuestionTypeSchema`: `z.enum(["single", "multi"])`.
- `DraftOptionSchema`: `text`, `isCorrect`. No length bounds on any
  draft array. The bounds stay in the server generation schema, so
  evals can parse a structurally bad quiz and report on it.
- `DraftQuestionSchema`: `text`, `type`, `options`.
- `DraftQuizSchema`: `title`, `description?`, `questions`.
- `OptionSchema`, `QuestionSchema`, `QuizSchema`: the draft shapes
  extended with `id: z.uuid()`.
- `PublicOptionSchema`, `PublicQuestionSchema`: the canonical shapes
  with `isCorrect` omitted.
- `AskQuestionPayloadSchema`: `question: PublicQuestionSchema`,
  `index`, `total`, `reason?`. The `index` and `total` fields are
  presentation only. They show progress. They carry no identity.
- `ResumeSchema`: `selections`, an array of 1 to 4 unique option id
  strings.
- `AnswersSchema`: a record from question id to the selected option
  ids. The key makes a second answer for one question structurally
  impossible, in the same way the composite key on `AnswerSelection`
  works.

The strict generation schema stays in `server/src/agent/agent.schemas.ts`
under the name `GeneratedQuizSchema`. It composes the draft schemas and
adds the LLM bounds: exactly 4 options, 5 to 8 questions, and the
`describe()` annotations. The server-local `AskQuestionPayloadSchema`
and `ResumeSchema` move to `shared` and disappear from that file.

## One spelling for the question type

Domain code spells the type `"single"` and `"multi"` everywhere. The
Prisma enum keeps `SINGLE` and `MULTI`. One module,
`server/src/agent/question-type-map.ts`, holds the two conversion
functions. Only code that touches Prisma imports it. The
`toUpperCase()` cast in `score-answers.ts` disappears.

`ScorableQuestion` in `scoring.types.ts` changes its `type` field to
`"single" | "multi"` and its id sets to `ReadonlySet<string>`. Scoring
stays a pure function and stays free of persistence imports. The
scoring tests keep their scenarios and change only the literals.

## Graph state changes

- `draft: DraftQuiz?`: written by `generateQuestions`.
- `quiz: Quiz?`: written by `persistQuiz`. Holds the ids.
- `quizId` channel: removed. `state.quiz.id` replaces it.
- `answers: Answers`: written by `askQuestion`. A record keyed by
  question id. No consumer joins answers to questions by array index.
  A future question shuffle cannot corrupt scoring.
- `scores: Record<questionId, number>`: written by `scoreAnswers`,
  keyed the same way, so `finalize` writes each `Answer.score` row by
  lookup.
- `finalScore?: number`: unchanged. The final score weights are
  positional by spec rule. `scoreAnswers` iterates `quiz.questions`
  for the weight order. `quiz.questions` is the only order source in
  the app.

## Node changes

- `generateQuestions`: parses with `GeneratedQuizSchema`. Returns
  `{ draft }` instead of `{ quiz }`.
- `persistQuiz`: reads `state.draft`. The idempotency guard becomes
  `if (state.quiz) return {}`. The nested create adds an `include`
  with `orderBy: { position: "asc" }` on questions and options. The
  node zips the returned rows into a canonical `Quiz` and returns
  `{ quiz }`.
- `askQuestion`: the payload question carries option ids and no
  `isCorrect`. The resume value is a set of option ids. Validation
  order per attempt: `ResumeSchema` parse, then membership (every id
  belongs to this question), then cardinality (`single` takes exactly
  one). Every failure re-prompts with a reason. Nothing throws inside
  the loop. A stale submit for another question fails the membership
  check and re-prompts. The membership check is a five-line inline
  `Set` lookup, not a `ScoringService` call, because the service
  throws and the loop must not. The node returns the answers record.
- `scoreAnswers`: iterates `quiz.questions` and looks up each answer
  by question id. It first validates that every question id has an
  answer. It builds `ScorableQuestion` with real option id strings.
  The cast disappears. The node returns the scores record and the
  final score. The node stays outside the interrupt loop, so the
  `ScoringService` throw on an invalid answer remains acceptable
  defense in depth.

## Evals changes

- Add `@quizforge/shared` to the dependencies of `evals`.
- `evals/src/quiz-shape.ts` deletes `EvalOptionSchema`,
  `EvalQuestionSchema` and `EvalQuizSchema`. It imports the draft
  schemas from `shared` instead.
- `structuralFailures` stays in `evals` unchanged. The deterministic
  checks remain the independent acceptance test that the eval spec
  requires. Only the type duplication goes.
- The stale comment about the server schema having no questions goes.

## Out of scope

- The `finalize` node itself. This task only makes its write direct.
- The REST endpoints and `AgentService` surface. They come next and
  consume this contract.
- The SSE event union. It lands in `shared/src/index.ts` with Phase
  3.5.
- Option or question shuffling. The id contract permits it later.
- The `strategy`/`model` TODO fields in `persistQuiz`.

## Testing

- `pnpm test` stays green. Scoring tests are the floor.
- Update the node specs and the journey test to the id contract. The
  journey test asserts that no interrupt payload and no state answer
  contains `isCorrect`, and that a resume with a foreign option id
  re-prompts instead of wedging the thread.
- `pnpm typecheck` across all packages, because `shared` gains its
  first real exports.

## Documentation changes

- `README.md`: no contract change. The code moves to the contract the
  README already documents. Check the state-shape wording once the
  channels rename.
- `docs/PLAN.md`: tick nothing new. Reword the `finalize` item only if
  its description mentions index mapping.
