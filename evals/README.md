# Evals

This package gives each generated quiz a score. The scorecard controls
prompt and strategy decisions. Do not judge question quality from one
output.

## Commands

Run these from the repository root:

```
pnpm eval:fixtures   # downloads the fixture documents into the cache
pnpm eval:judge      # calibrates the judge with planted bad questions
pnpm eval            # runs the scorecard over all fixtures
```

## Configuration

The generator uses the server variables: `LLM_PROVIDER`, `OLLAMA_MODEL`,
`GROQ_MODEL`. The judge has its own seam, so it can run on a different
model than the generator:

- `JUDGE_PROVIDER`: `ollama` (default) or `groq`.
- `JUDGE_OLLAMA_MODEL`: required for Ollama. Pick a model different from
  the generator model.
- `JUDGE_GROQ_MODEL`: optional, defaults to `llama-3.3-70b-versatile`.

## How the harness works

The run has three stages per fixture:

1. **Generate.** The runner imports the real `generateQuestions` node from
   `server` and runs it on the cached fixture document.
2. **Check structure.** Deterministic checks validate the shape: 5 to 8
   questions, 4 options per question, one correct option for a
   single-answer question, 2 or more for a multi-answer question. These
   checks run before the judge and never use an LLM.
3. **Judge.** An LLM scores each question against the source document on
   three criteria, and the whole quiz on one:
   - **Answerability**: the source alone must answer the question.
   - **Single defensible answer**: the marked answers must be the only
     defensible ones.
   - **Distractor plausibility**: a wrong option must be wrong but on
     topic.
   - **Coverage**: the share of the key topics of the document that the
     quiz asks about.

The runner prints a scorecard table and writes a JSON file to `results/`.
The JSON files give a prompt change a score from before the change and
after it.

## Fixtures

`fixtures/manifest.json` pins three READMEs with different shapes to
commit SHAs:

| Fixture     | Shape       |
| ----------- | ----------- |
| langgraphjs | library     |
| pipecat     | application |
| left-pad    | sparse      |

`pnpm eval:fixtures` downloads them into `fixtures/cache/`. The cache and
`results/` are gitignored.

## Judge calibration

The judge grades the generator, so the harness first grades the judge.
`src/negatives.ts` holds three hand-written bad questions per fixture: one
with a hallucinated fact, one with two defensible answers, and one
answerable from general knowledge but not from the document.
`pnpm eval:judge` runs the judge over them. The judge must reject every
planted question. If the judge passes one, the calibration fails and the
blame is on the judge, not the generator.

## Current status

The server `QuizSchema` does not have questions yet. Until that work
lands, `pnpm eval` reports one structural failure per fixture and shows
`n/a` for the judged columns. The schema in `src/quiz-shape.ts` is the
structural contract that the future server schema must satisfy.
