# Quiz Agent Task Plan

AI Engineer second interview task. Node.js/TypeScript agent system that generates a quiz from a Markdown URL, runs it with HITL, scores it, and persists everything.

Target: build Thu/Fri, rehearse Monday, interview Tue/Wed.
Budget: 12 to 14 hours total (eval harness replaces the old verification phase in the budget).

Cut line: if time runs short, Phase 3.5 Tier 2 goes first, then the second
generation strategy. The eval harness is not cuttable; it is how prompt
quality decisions get made.

## Phase 1: Skeleton (2 to 3 hours)

- [x] mise env setup: pin Node + pnpm versions in `mise.toml`, `.env` from example (Ollama gemma4:31b as default provider, Groq as alternative)
- [x] Scaffold pnpm monorepo: `server` (NestJS), `web` (Vue 3), `shared` (types)
- [x] Spike file before real code: verify LangGraph JS `interrupt()` / `Command({ resume })`, `PostgresSaver.setup()`, conditional edges, and `streamEvents()` in one throwaway script (the JS API diverges from Python in small ways). Findings: the wedge hazard reproduces (a throw inside the interrupt loop replays the cached resume value forever, re-prompting recovers); node names cannot collide with state channel names
- [x] docker-compose with a single Postgres instance
- [x] process-compose dev orchestration: `infra` (docker compose), `server`, `web` as separately restartable processes with readiness gates, behind `pnpm dev`
- [x] Prisma schema: `Quiz`, `Question`, `Option`, `Attempt`, `Answer` (plus `AnswerSelection`). Delete rules follow "cascade ownership, restrict history"; `Attempt.startedAt` has no default because the row is written at finalize
- [x] Nest modules:
  - [x] `AgentModule`: compiles the graph once at bootstrap. The checkpointer sits behind a `CHECKPOINTER` token typed as `BaseCheckpointSaver`, with `setup()` awaited in its async factory rather than in `onModuleInit`, so nothing downstream is pinned to Postgres
  - [x] `ScoringService`: pure function, no I/O. Three modes behind `SCORING_MODE`; an unknown mode fails at startup
    - [x] Validates that every selected option belongs to the question being scored. The FK on `AnswerSelection.optionId` buys existence, not membership, and a valid option from a different question would otherwise score silently. This is also the re-prompt path in the interrupt loop, so it is needed either way
  - Deferred to Phase 2: `QuizModule` and the callable surface on `AgentService`. Both describe a graph that has no nodes yet, so their shape follows from the nodes and not the reverse
- [x] Provider seams via DI tokens: LLM provider (Groq/Ollama swap by config), generation strategy interface. The generation token currently resolves to an enum value and not to an implementation, so a consumer has to switch on it. The registry pattern from `MULTIPLE_CHOICE_SCORING_STRATEGY` closes that, and the work waits until the generation node exists

## Phase 2: The graph (2 to 3 hours)

Nodes:

- [ ] `fetchSource`: convert GitHub blob URLs to raw.githubusercontent.com, handle fetch errors, prune content to fit context
- [ ] `generateQuestions`: LLM call with Zod-validated structured output, one repair round on validation failure
- [ ] `askQuestion`: `interrupt()` carrying the question payload with `isCorrect` flags stripped
- [ ] `scoreAnswer`: deterministic, calls `ScoringService`
- [ ] `finalize`: weighted average (geometric weights, ratio 1.1), persist attempt to domain tables

Rules:

- [ ] Never raise inside the interrupt loop: invalid answers re-prompt with a reason (LangGraph replays cached resume values on retry; an exception wedges the thread)
- [ ] Correct answers never leave the server; scoring is server-side only
- [ ] thread_id = session id

Endpoints:

- [ ] `AgentService` exposes a callable surface, not the graph object: `startSession(url)` and `submitAnswer(threadId, selections)`. This is the boundary that strips `isCorrect`, so a controller cannot return raw graph state
- [ ] `QuizModule`: thin controllers over that surface. It imports `AgentModule`, and `AgentModule` imports `ScoringModule` for the `scoreAnswer` node
- [ ] `POST /sessions`: start graph, run to first interrupt, return question 1 (streaming response, see Phase 3.5)
- [ ] `POST /sessions/:id/answers`: resume with `Command({ resume })`, return next question or final score (streaming response)
- [ ] `GET /sessions/:id`: read current state
- [ ] Build the endpoints JSON-first, then upgrade to SSE in Phase 3.5; keep a `?stream=false` fallback for curl demos and tests

Tests and evals:

- [ ] Unit tests on `ScoringService` first: single answer, multi answer partial credit, weighted average, edge cases
- [ ] One journey test through the compiled graph with a scripted fake model
- [ ] Eval harness before prompt iteration begins:
  - [ ] Fixture set via manifest + fetch script: real READMEs (langgraphjs, pipecat, left-pad) cached into `evals/fixtures/cache` (gitignored), refs pinned to commit SHAs before comparative runs
  - [ ] LLM-as-judge script scoring each generated quiz on: answerability from source (precision), topic coverage of the doc (recall), exactly-one-defensible-answer for single-answer questions, distractor plausibility
  - [ ] Judge calibration with seeded negatives: ~3 hand-written bad questions per fixture (one hallucinated fact, one with two defensible answers, one answerable from general knowledge but not the doc); `pnpm eval:judge` must catch all of them or the judge fails, not the generator
  - [ ] Structural checks stay deterministic, not judged: 4 options, 5 to 8 questions, multi-answer cardinality
  - [ ] `pnpm eval` runs the set and prints a scorecard; results logged to LangSmith as experiment runs

## Phase 3: UI and polish (2 to 3 hours)

- [ ] Minimal Vue UI: URL input, question flow, single vs multi-select, final score screen
- [ ] Iterate the generation prompt against the eval scorecard, not by eyeballing output; keep before/after scores as the improvement story
- [ ] Compare the two strategies on the same fixtures with the same judge, so "different strategies" comes with evidence, not vibes
- [ ] LangSmith tracing on the generation call
- [ ] Second generation strategy behind the strategy interface (e.g. single-pass vs chunked)
- [ ] Repo README: data-flow explanation, quickstart, deliberate "known limitations" section

## Phase 3.5: Streaming (1.5 to 2 hours)

Tier 1, progress streaming (do this one first):

- [ ] Bridge the graph's stream into an SSE response: LangGraph async iterator to RxJS observable, NestJS `@Sse()` / manual SSE write on the POST endpoints
- [ ] Emit node-level progress events during session start: fetching source, generating questions, validating
- [ ] Boundary rule: stream progress only, never partial question JSON (half-parsed structured output is brittle, and raw generation contains the correct flags)
- [ ] Vue side: parse the SSE stream via `fetch` + `ReadableStream` (native `EventSource` is GET-only, endpoints are POSTs)

Tier 2, conversational framing (stretch, first thing cut):

- [ ] `askQuestion` node produces a short LLM framing line per question; tokens stream to the UI, structured question payload follows when the interrupt lands
- [ ] Answer channel stays structured buttons; no free text touches scoring
- [ ] Event protocol: `progress` | `token` | `question` | `result`, typed in `shared`

## Phase 4: Rehearsal (2 hours, separate day)

- [ ] Dry run: clean clone to completed quiz, timed
- [ ] Data-flow walkthrough out loud, including the two-ownership-zones Postgres story (checkpointer tables framework-owned, domain tables Prisma-owned, why both)
- [ ] Multi-answer scoring discussion: the spec rule is recall-only and gameable (select everything); alternatives (penalized, Jaccard, F1) behind a config flag
- [ ] "What I'd do next" backlog prepared
- [ ] "When would I split the agent into its own service" answer: different scaling profile, different language deps, different owning team; none apply here

## Interview talking points

- Monolith by default, split when forced
- Intelligence ends where grading begins: LLM generates, deterministic code scores
- Prior art: Freightcase (same HITL machinery in Python, opposite polarity: extract-then-confirm vs generate-then-ask)
- The wedge test story: found the replay-on-retry behavior the hard way, pinned by tests
- Streaming boundary: progress and framing tokens stream, structured payloads land whole; partial JSON never crosses the wire and correct flags never leave the server
- Evaluation-driven: prompt changes are judged by a scorecard (answerability = precision, coverage = recall), structural validity stays deterministic; the judge grades the generator, never the user
- The README is the answer key: no golden quizzes, the judge verifies quiz against source; the judge itself is calibrated with planted bad questions it must catch
