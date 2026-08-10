# AGENTS.md

Quiz agent app: NestJS API with an embedded LangGraph JS agent, Vue 3 web
UI, Postgres. pnpm monorepo: `server`, `web`, `shared`. Node and pnpm
versions are pinned in `mise.toml`.

See `README.md` for architecture and design rationale, `docs/PLAN.md` for
build phases and the cut line, and `docs/SPEC.pdf` for the original task
requirements (the source of truth when README and spec disagree).
`SPEC.pdf` is local-only, excluded via `docs/.gitignore`; never commit it
or copy its contents into tracked files. Keep docs in sync with the code:
if a promise in the README gets cut, the README edit is part of the cut.

## Commands

```
pnpm dev              # process-compose: infra + API :3000 + web :5173
pnpm dev:down         # stop the whole stack
pnpm test             # unit + journey tests
pnpm eval             # generation quality scorecard over evals/fixtures
pnpm prisma migrate dev
docker compose up -d  # Postgres on its own, without process-compose
```

`pnpm dev` runs the three processes under process-compose so each can be
restarted and watched on its own: in the TUI, F5 restarts the selected
process, F6 stops it, F8 shows its log. `server` waits for Postgres to pass
`pg_isready`; `web` only waits for `server` to start, so the UI still comes
up when the API is broken. Use `pnpm dev:raw` to bypass process-compose
and run the two dev servers directly.

## Hard rules

These are invariants, not preferences. Do not trade them away while
implementing something else.

1. **Never throw inside the interrupt loop.** LangGraph replays the
   cached resume value on retry; an exception on a malformed answer
   wedges the thread permanently. Invalid input becomes a re-prompt with
   a reason. The only exit from a question is a valid answer.
2. **Correct answers never leave the server.** Strip `isCorrect` from
   every interrupt payload and every API response. If you add a new
   response shape, check it.
3. **Scoring is a pure function.** No I/O, no LLM, no dates, no config
   reads inside `ScoringService`. Spec rule: 4 correct, 0 wrong,
   count-of-correct for multi-answer. Final score: weighted average,
   geometric weights ratio 1.1 starting at 1.0. Alternative modes go
   behind `SCORING_MODE`.
4. **Payloads land whole.** Stream progress events and framing tokens;
   never stream partial question JSON. The SSE event union
   (`progress | token | question | result | error`) lives in `shared`
   and both sides import it.
5. **Prompt changes require eval evidence.** Run `pnpm eval` before and
   after any change to generation prompts or strategies; do not judge
   question quality by eyeballing one output. Structural checks (4
   options, 5 to 8 questions, multi-answer cardinality) stay
   deterministic and out of the LLM judge.

## Architecture notes

- The graph compiles once at bootstrap in `AgentModule` and is injected;
  controllers stay thin. The checkpointer is built and `setup()` is awaited
  inside its async factory, not in `onModuleInit`: `setup()` exists only on
  `PostgresSaver`, so calling it from the consumer would pin that consumer to
  Postgres. `AgentService` sees only `BaseCheckpointSaver`, which is what lets
  a test swap in `MemorySaver`.
- Two ownership zones in one Postgres: checkpointer tables are
  framework-owned (never queried directly), domain tables
  (`Quiz`, `Question`, `Option`, `Attempt`, `Answer`) are Prisma-owned.
- `thread_id` = session id.
- LLM provider and generation strategy sit behind DI tokens; swap by
  config (`GENERATION_STRATEGY`, provider env), never by code edits.
- GitHub blob URLs are converted to raw.githubusercontent.com in
  `fetchSource`.

## Conventions

- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`,
  `refactor:`, with scope when useful (`feat(agent):`, `fix(scoring):`).
  Imperative mood, no trailing period. Scopes: `agent`, `scoring`, `api`,
  `web`, `evals`, `db`.
- TypeScript strict everywhere; shared types live in `shared`, never
  duplicated per package.
- Zod schemas validate all LLM output; one repair round, then fail loudly.
- Tests colocated with the code they test; scoring tests are the floor,
  keep them green.
- No em dashes in any prose or docs.
- Write all documentation in Simplified Technical English (ASD-STE100).
  This applies to `README.md`, files in `docs/`, JSDoc blocks and code
  comments. Use the active voice. Keep descriptive sentences to 25 words
  or fewer, and instructions to 20 words or fewer. Give one instruction
  per sentence. Use the same word for the same thing every time. Keep
  paragraphs to 6 sentences or fewer. Do not use idioms or figures of
  speech.
