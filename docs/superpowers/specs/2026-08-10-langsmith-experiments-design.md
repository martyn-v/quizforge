# Eval results as LangSmith experiment runs

Date: 2026-08-10. Status: approved.

## Goal

Each `pnpm eval` batch becomes one LangSmith experiment. Each fixture
becomes one run in that experiment. Each judge metric becomes one
feedback entry on its run. The LangSmith UI can then compare eval
batches side by side, per fixture and per metric.

## Background

The eval runner scores fixtures locally and writes a JSON scorecard to
`evals/results/`. Tracing sends the live LLM calls to the
`<project>-evals` LangSmith project, but nothing groups a batch and the
judge scores never reach LangSmith. The README roadmap promises an
upload step after the eval loop. This design implements that promise.

A LangSmith experiment is a set of runs. Each run references one
example in a dataset. The design therefore needs a dataset with one
example per fixture, and one linked run per fixture per batch.

## Design

### New module: `evals/src/langsmith-upload.ts`

The module has two exports.

`feedbackEntries(score)` is a pure function. It maps one `FixtureScore`
row to a list of feedback entries. Each entry has a key, a score, and
an optional comment. The rules are:

- `answerability`, `singleDefensible`, `distractorPlausibility`,
  `coverage`, and `multiFraction` map to feedback keys
  `answerability`, `single_defensible`, `distractor_plausibility`,
  `coverage`, and `multi_fraction`. Each score is a number from 0 to 1.
  A null metric produces no entry.
- `retries` maps to the key `retries` as a plain count. A null value
  produces no entry.
- The structural check maps to the key `structural`. The score is 1
  when the failure list is empty and 0 otherwise. The joined failure
  list becomes the comment.

`uploadScorecard(options)` performs the upload. The options are the
fixture manifest, the score rows, the generator info, the judge info,
the comment, and the timestamp. The steps are:

1. **Gate.** Return after one log line unless `LANGSMITH_TRACING` is
   `true` and `LANGSMITH_API_KEY` is set. No new environment variables.
2. **Dataset.** Read the dataset named by `LANGSMITH_PROJECT`, which
   `env.ts` already suffixes with `-evals`. Create the dataset when it
   does not exist. Upsert one example per manifest fixture. The example
   inputs are the fixture id, shape, and url. The fixture id also lives
   in the example metadata and is the upsert key.
3. **Experiment.** Create one project per batch, named `eval-<stamp>`,
   with the dataset as its reference. The generator info, judge info,
   and comment go into the project metadata.
4. **Runs and feedback.** Create one run per fixture inside the
   experiment, linked to its dataset example. The run inputs are the
   fixture reference. The run outputs are the score row. Then create
   one feedback entry per item from `feedbackEntries`.

The whole upload sits in one try/catch. A failure logs a warning and
returns. The local JSON stays the source of truth. `pnpm eval` cannot
fail because LangSmith is down.

### Call site

`run-eval.ts` calls `uploadScorecard` once, after it writes the
results file.

### Dependency

`langsmith` becomes a direct dependency of the `evals` package, pinned
to the 0.8.9 line already present in the lockfile.

## Out of scope

- The eval loop itself does not change. The runner does not move to
  the LangSmith `evaluate()` helper.
- The live traces from generation and judge calls stay as they are.
  They do not nest under the experiment runs.
- No retention or cleanup of old experiments.

## Docs

The README Observability section gets a short paragraph on experiment
upload. The roadmap entry moves out. The TODO checkbox gets a tick
after verification.

## Tests

- `langsmith-upload.spec.ts`: `feedbackEntries` mapping. A full row
  produces seven entries. Null metrics produce no entries. Structural
  failures produce a 0 score with a comment. No test touches the
  network.

## Verification

`pnpm lint` and `pnpm test` stay green. One live `pnpm eval` with
tracing on. Read the experiment back through the LangSmith API and
check the runs, the feedback, and the metadata. This mirrors the
tracing verification in eb21beb.
