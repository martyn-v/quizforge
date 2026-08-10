# Eval harness: retry indicator and question mix

Date: 2026-08-10. Status: approved.

## Goal

The eval scorecard gets two new signals. The first signal is the number
of repair retries that generation needed. The second signal is the mix
of single-answer and multi-answer questions.

## Background

The repair round retries generation when the model output fails the
schema. The scorecard does not show how often this happens. The README
promises a mix of single-answer and multi-answer questions, so both
scoring paths get exercise. The scorecard does not check this promise.

## Design

### Retry count travels in graph state

`QuizState` gets an optional `generationRetries` number field. The
`generateQuestions` node sets the field in its update. The value is the
attempt count minus one. A first-try success reports 0. One repair
round reports 1. The `startedAt` field set this precedent: the node
reports a fact through state, and any consumer can read it.

### Mix checks are structural failures

`structuralFailures` in `evals/src/quiz-shape.ts` gets two checks. A
quiz with no multi-answer question fails. A quiz with no single-answer
question fails. Both checks are deterministic and stay out of the LLM
judge.

### Scorecard fields and columns

`FixtureScore` gets two fields. `retries` is a number or null.
`multiFraction` is the share of multi-answer questions, a number or
null. The runner reads `generationRetries` from the node update. A
fixture that fails generation gets null for both fields. The table gets
a `retries` column and a `multi` column. The `multi` cell renders as a
percent, like the other cells.

## Out of scope

The generation prompt does not change. A prompt change requires a
before-and-after eval pair and is separate work. The server schema does
not enforce the mix.

## Consequence

A quiz with only single-answer questions passes today. After this
change, that quiz shows a structural failure. This is intended.

## Tests

- `generate-questions.spec.ts`: 0 retries on clean success, 1 after a
  repair round.
- `quiz-shape.spec.ts`: the two new structural failures, and a mixed
  quiz that passes.
- `scorecard.spec.ts`: `multiFraction` aggregation and the new columns.
