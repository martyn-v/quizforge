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

`pnpm eval` takes an optional comment that describes the run:
`pnpm eval "before the mix prompt change"`. The runner stamps the
comment into the results JSON. The field is null when no comment is
given.

## Configuration

The generator uses the server variables: `LLM_PROVIDER`, `OLLAMA_MODEL`,
`GROQ_MODEL`, `LLM_TEMPERATURE`, `LLM_THINK`, `GENERATION_STRATEGY`. The
eval generator mirrors the server seam, so the scorecard measures the
model and strategy configuration that the application ships. The runner
resolves the strategy from the same registry as the server, so the
strategy label in the results JSON names the code that ran. The judge has its own seam, so it can run on a
different model than the generator:

- `JUDGE_PROVIDER`: `ollama` (default) or `groq`.
- `JUDGE_OLLAMA_MODEL`: required for Ollama. Pick a model different from
  the generator model.
- `JUDGE_GROQ_MODEL`: optional, defaults to `llama-3.3-70b-versatile`.
- `JUDGE_TEMPERATURE`: optional, defaults to `0` for deterministic verdicts.
- `JUDGE_THINK`: optional, defaults to `false`. Thinking models such as
  qwen3.5 reason before every answer, which makes a run slow. Set `true`
  to let the judge reason.

## How the harness works

The run has three stages per fixture:

1. **Generate.** The runner imports the real `generateQuestions` node and
   the real strategy registry from `server`, selects the strategy that
   `GENERATION_STRATEGY` names, and runs it on the cached fixture document.
2. **Check structure.** Deterministic checks validate the shape: 5 to 8
   questions, 4 options per question, one correct option for a
   single-answer question, 2 or more for a multi-answer question. The
   quiz must contain both question types. A question must not reveal how
   many options are correct, for example with "select 2" in the question
   text. These checks run before the judge and never use an LLM.
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
Three indicator columns sit next to the judge scores: the share of
multi-answer questions, the number of repair rounds that generation
needed, and the generation latency in seconds. The latency clock covers
the successful generation call with its repair rounds. It excludes
rate-limit waits, because they measure the provider quota and not the
strategy. A fixture that fails generation shows `n/a` in every column
and does not end the run. The JSON files give a prompt change a score from
before the change and after it.

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
`src/judge/negatives.ts` holds three hand-written bad questions per fixture: one
with a hallucinated fact, one with two defensible answers, and one
answerable from general knowledge but not from the document.
`pnpm eval:judge` runs the judge over them. The judge must reject every
planted question. If the judge passes one, the calibration fails and the
blame is on the judge, not the generator.

## Current status

The harness runs end to end against the real generation node. The runs
from 2026-08-10 (Groq `llama-3.3-70b-versatile` generator, `gemma4:31b`
judge) show three open generation defects:

- The left-pad fixture produces a quiz with no multi-answer question.
  The mix check flags it.
- The langgraphjs fixture fails generation: a multi-answer question has
  4 correct options, and the repair round does not fix it.
- The gemma4 generator reveals the answer count in question text, for
  example "select 2". The count-leak check flags it.

The next step is a generation prompt change that addresses these
defects, with the current scorecards as the before half of the
evidence pair. The pipecat fixture is blocked by the Groq free-tier
rate limit, not by a generation defect.
