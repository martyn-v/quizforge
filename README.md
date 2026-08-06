# Quizforge

**A quiz agent that reads a document and tests you on it.** Point it at any
Markdown URL and the agent generates a short test, runs the session
question by question, scores your answers, and stores the full record.
Built as a small production-ready application, not a proof of concept.

Node.js/TypeScript throughout: NestJS API with an embedded LangGraph agent,
Vue 3 web UI, Postgres for persistence.

## How a session moves

The whole session is one stateful LangGraph graph, checkpointed to
Postgres:

```
fetchSource -> generateQuestions -> askQuestion -> scoreAnswer
                                        ^               |
                                        |  more questions
                                        +---------------+
                                                        |
                                                   all answered
                                                        v
                                                    finalize
```

The pause at **askQuestion** is durable. The node calls `interrupt()` with
the question payload, state checkpoints, and the process can restart
between question and answer. The answer arrives as a
`Command({ resume: selectedOptionIds })` and the graph picks up where it
stopped. The REST API is a thin driver over this graph:

| Endpoint                     | Role                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| `POST /sessions`             | Start the graph, run to the first interrupt, return question 1      |
| `POST /sessions/:id/answers` | Resume with the answer, return the next question or the final score |
| `GET /sessions/:id`          | Read current session state                                          |

The `thread_id` is the session id.

Both POST endpoints stream. The response is SSE carrying a typed event
union (`progress | token | question | result`, defined once in `shared`
and imported by both sides): node-level progress while the graph runs,
framing tokens as the agent introduces a question, then the structured
question or final result as a whole payload when the interrupt lands.
Partial JSON never crosses the wire, and since the browser's native
`EventSource` is GET-only, the web client reads the stream via `fetch`
with a `ReadableStream` parser. `?stream=false` returns plain JSON for
curl and tests.

## Scoring

Per question:

- 4 points for a correct answer
- 0 points for a wrong answer
- For multi-answer questions, the number of correctly selected answers
  (0 to 4)

The final score is a weighted average of the individual scores. Weights
follow a geometric sequence starting at 1.0 with ratio 1.1, so question n
carries weight 1.1^(n-1) and later questions count more:

```
final = sum(score_i * 1.1^(i-1)) / sum(1.1^(i-1))
```

The result lands on the same 0 to 4 scale as individual answers.

Scoring is a pure function with no I/O and no model involvement, covered
by unit tests. The LLM generates questions; deterministic code grades
them. Intelligence ends where grading begins.

**A note on the multi-answer rule.** As specified, the rule rewards
correct selections and never penalizes wrong ones, which makes "select
everything" the optimal strategy on multi-answer questions. In
precision/recall terms it is a recall-only metric. The spec rule is the
default; a penalized variant (`max(0, correct - wrong)` scaled to 4) is
available behind the `SCORING_MODE` config flag.

## Assumptions

Decisions made where the requirements left room, each defensible and each
reversible:

- **"The agent system should run the quiz" is read strongly.** The agent
  is not just the question generator with a conventional app around it.
  The full session lifecycle (generate, ask, collect, score, finalize) is
  one graph with human-in-the-loop interrupts. The weak reading (agentic
  generation, plain CRUD for the rest) would also satisfy the letter of
  the spec but gives up durability and a coherent data-flow story.
- **Question count is configurable within 5 to 8**, defaulting to 6. The
  generator is instructed to mix single-answer and multi-answer questions
  so both scoring paths are exercised.
- **Every question has exactly 4 options.** Multi-answer questions have
  2 or 3 correct options; a multi-answer question where all 4 are correct
  is rejected at validation because it cannot distinguish knowledge from
  the select-everything strategy.
- **Correct answers never leave the server.** The interrupt payload and
  every API response strip the `isCorrect` flags. Scoring happens
  server-side on submission.
- **GitHub blob URLs are accepted and converted** to their
  raw.githubusercontent.com form. Any URL that returns Markdown or plain
  text works.
- **Source documents are pruned, not chunked, by default.** READMEs fit
  comfortably in context after stripping badges, HTML, and link noise.
  The chunked strategy exists for larger documents (see Strategies).

## Patterns

The parts of the design that carry weight:

- **Embedded agent, not an agent service.** LangGraph JS is a library, so
  the graph compiles once at bootstrap inside a Nest `AgentModule` and is
  injected where needed. Monolith by default; splitting the agent out
  earns its complexity only with a different scaling profile, different
  language dependencies, or a different owning team. None apply to a quiz
  app.
- **Two ownership zones, one Postgres.** The checkpointer tables belong
  to `@langchain/langgraph-checkpoint-postgres` (framework-managed schema,
  created by `setup()` at module init) and hold serialized graph state so
  sessions survive restarts. The domain tables (`Quiz`, `Question`,
  `Option`, `Attempt`, `Answer`) belong to Prisma and are the durable,
  queryable record, written by generation and by the finalize node. You
  do not query framework checkpoints for reporting, and you do not
  rebuild resumability on top of relational tables when the framework
  provides it.
- **Domain writes are lazy; the checkpointer owns live runs.** Generation
  persists Quiz, Question, and Option eagerly (a definition is complete
  the moment it exists), but nothing run-side touches the domain tables
  until `finalize` writes Attempt and all Answers in one transaction.
  Mid-quiz durability is already the checkpointer's job; eager Answer
  writes would store the same fact twice and leave orphan rows on
  abandoned sessions. Trade-off: no SQL reporting on in-progress
  attempts, which nothing here needs.
- **Human input inside an interrupt loop must never raise.** LangGraph
  caches the resume value in the checkpoint and replays it on retry, so
  an exception thrown on a malformed answer wedges the thread
  permanently. Every invalid submission (unknown option ids, wrong
  cardinality, malformed body) becomes a re-prompt with the reason
  attached. The only exit from a question is a valid answer.
- **Structured output with one repair round.** Question generation is
  bound to a Zod schema. A validation failure feeds the errors back to
  the model once; a second failure fails the session loudly rather than
  serving a malformed quiz.
- **Stream progress and prose, land payloads whole.** Node updates and
  framing tokens stream token by token; questions and results arrive as
  complete validated objects. Streaming partial structured output would
  mean parsing half-formed JSON on the client and would put the raw
  generation, correct flags included, on the wire.
- **Seams via DI tokens.** The LLM provider (Groq by default, Ollama for
  local runs) and the generation strategy sit behind interfaces, swapped
  by configuration, not code edits.

## Strategies

Question generation is pluggable behind a single interface:

| Strategy                | Approach                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `single-pass` (default) | One generation call over the pruned document                                             |
| `chunked`               | Split the document by section, generate per chunk, dedupe and sample to the target count |

Selected via `GENERATION_STRATEGY`. Adding a strategy is one class and one
registry entry.

## Evals

Prompt and strategy decisions are made against a scorecard, not by
eyeballing output. `pnpm eval` runs every generation strategy over a
fixture set of three READMEs with deliberately different shapes (library,
application, sparse) and scores each generated quiz on two axes plus
hygiene:

- **Answerability** (precision): is each question answerable from the
  source document alone, with no hallucinated facts, and exactly one
  defensible answer where one is claimed
- **Coverage** (recall): what fraction of the document's key topics the
  quiz touches
- **Distractor plausibility**: wrong options should be wrong, not absurd

The judge is an LLM; structural validity is not its job. Option counts,
question counts, and multi-answer cardinality are checked
deterministically before the judge ever runs. Results are logged to
Langfuse as dataset runs, so prompt changes come with before/after
scores. The judge grades the generator, never the user.

## Quickstart

```
mise install                  # pinned Node + pnpm from mise.toml
docker compose up -d          # Postgres
cp .env.example .env          # add your GROQ_API_KEY
pnpm install
pnpm prisma migrate dev       # domain tables (checkpointer creates its own)
pnpm dev                      # API on :3000, web on :5173
pnpm eval                     # optional: score generation quality on the fixture set
```

Open the web UI, paste a Markdown URL (two known-good examples are in
`.env.example`), and take the quiz.

## Observability

Generation calls are traced to Langfuse when `LANGFUSE_*` keys are set in
the environment. Traces carry the source URL, the strategy, token usage,
and validation repair rounds.

## Known limitations, deliberate at this scope

- **No authentication.** Sessions are addressable by anyone holding the
  session id.
- **`GET /sessions/:id` reads graph state, not domain tables.** Fine for
  driving the UI; reporting queries belong on the Prisma side and only
  the completed attempt is written there.
- **Question quality is eval-informed, not eval-gated.** The scorecard
  drives prompt iteration during development, but a low-scoring quiz is
  not blocked at generation time; runtime enforcement is limited to the
  deterministic structural checks. Gating live generation on a judge
  call would double latency and cost per session for marginal benefit at
  this scale.
- **One process.** The Postgres checkpointer makes horizontal scaling
  possible, but nothing here needs it yet.
