# Eval harness design

Date: 2026-08-07
Status: approved in discussion, pending review of this document

## Goal

Build the `pnpm eval` harness from Phase 2 of `docs/PLAN.md`. The harness
gives each generated quiz a score. A scorecard controls prompt and strategy
decisions.

## Scope

This task builds the harness only. It does not extend `QuizSchema` in
`server/src/agent/agent.schemas.ts`. That schema work stays in the
generateQuestions task. Until that work lands, the scorecard shows
structural failures for generated quizzes. This output is correct and
expected.

## Package

Create a workspace package `evals/` with the name `@quizforge/evals`.
Add the package to `pnpm-workspace.yaml`. Run scripts with `tsx`.

Add these scripts to the root `package.json`:

- `pnpm eval`: run the full scorecard.
- `pnpm eval:fixtures`: download the fixture documents.
- `pnpm eval:judge`: calibrate the judge with seeded negatives.

## Fixtures

`evals/fixtures/manifest.json` lists three READMEs with different shapes:

| Fixture     | Shape       |
| ----------- | ----------- |
| langgraphjs | library     |
| pipecat     | application |
| left-pad    | sparse      |

Each entry pins a commit SHA and gives a raw.githubusercontent.com URL.
`eval:fixtures` downloads each document into `evals/fixtures/cache/`.
The cache directory is gitignored.

## Quiz shape and structural checks

`evals/src/quiz-shape.ts` holds a Zod schema for the intended full quiz
shape: questions, options, `isCorrect` flags, single and multi answer.
This schema is the structural contract of the eval. The checks run before
the judge and are deterministic:

- The quiz has 5 to 8 questions.
- Each question has 4 options.
- A single-answer question has exactly one correct option.
- A multi-answer question has 2 or more correct options.

When the real `QuizSchema` gains questions, the harness keeps these
checks. The checks are the acceptance test for that schema.

## Generation under test

The runner imports `makeGenerateQuestionsNode` from `server` and runs it
once per fixture. The generator uses the real provider seam, so
`LLM_PROVIDER` and its model variables select the generator model.

## Judge

`evals/src/judge.ts` scores each quiz against the fixture source. The
judge has its own provider seam with the same pattern as the application:

- `JUDGE_PROVIDER`: `ollama` (default) or `groq`.
- `JUDGE_OLLAMA_MODEL`: the Ollama judge model. Set this to a different
  model than the generator model.
- `JUDGE_GROQ_MODEL`: the Groq judge model, default
  `llama-3.3-70b-versatile`.

The judge scores four criteria:

- Answerability: the source document alone answers each question.
- Coverage: the quiz includes the key topics of the document.
- Distractor plausibility: a wrong option is wrong but not absurd.
- Single defensible answer: a single-answer question has exactly one
  defensible answer.

Zod validates the judge output. The judge gets one repair round, then the
run fails loudly. The judge does not check structural validity.

## Judge calibration

`evals/src/negatives/` holds about 3 hand-written bad questions per
fixture:

- One question with a hallucinated fact.
- One question with two defensible answers.
- One question answerable from general knowledge but not from the document.

`pnpm eval:judge` runs the judge over the negatives. If the judge passes
any negative, the calibration fails. A calibration failure blames the
judge, not the generator.

## Output

The runner prints a scorecard table to stdout. The runner also writes a
JSON results file to `evals/results/`. The results directory is
gitignored. The JSON files let a prompt change show a before score and an
after score.

## Documentation changes

- Replace Langfuse with LangSmith in `README.md` and `docs/PLAN.md`.
  LangSmith is the native LangGraph integration and Martyn knows it.
- The LangSmith integration itself stays in the Phase 3 observability
  work.

## Out of scope

- `QuizSchema` extension in `server`.
- LangSmith or Langfuse wiring.
- The chunked generation strategy. The runner takes the strategy from the
  environment and runs one strategy per invocation.
