# Quizforge

**A quiz agent that reads a document and asks you questions about it.** Give
the agent a Markdown URL. The agent generates a short test. It then runs the
session question by question, calculates your score, and stores the full
record. This is a small production application. It is not a proof of concept.

The application uses Node.js and TypeScript. It has a NestJS API with an
embedded LangGraph agent, a Vue 3 web interface, and Postgres for storage.

## How a session moves

One LangGraph graph controls the full session. The graph is checkpointed to
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

The **askQuestion** node makes a durable pause. The node calls `interrupt()`
with the question payload. The graph then writes a checkpoint. The process can
stop and start again between the question and the answer. The answer arrives
as a `Command({ resume: selectedOptionIds })`. The graph then continues from
the checkpoint. The REST API only starts and resumes the graph:

| Endpoint                     | Role                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| `POST /sessions`             | Starts the graph, runs to the first pause, returns question 1     |
| `POST /sessions/:id/answers` | Resumes with the answer, returns the next question or the score  |
| `GET /sessions/:id`          | Returns the current session state                                |

The `thread_id` is the session id.

Both POST endpoints send a stream. The response is SSE with a typed event
union (`progress | token | question | result`). The `shared` package defines
this union once, and the API and the web interface both import it. The stream
sends node progress while the graph runs. It then sends the framing tokens
that introduce a question. It then sends the question or the final result as
one complete payload. The API never sends incomplete JSON. The native
`EventSource` of the browser accepts GET requests only. The web client
therefore reads the stream with `fetch` and a `ReadableStream` parser. Add
`?stream=false` to get plain JSON for curl and for tests.

## Scoring

Each question has a score:

- A correct answer scores 4 points
- A wrong answer scores 0 points
- A multi-answer question scores the number of correct selections (0 to 4)

The final score is the weighted average of the question scores. The weights
are a geometric sequence. The sequence starts at 1.0 and has a ratio of 1.1.
Question n therefore has the weight 1.1^(n-1), and the later questions have
more effect on the final score:

```
final = sum(score_i * 1.1^(i-1)) / sum(1.1^(i-1))
```

The final score uses the same scale of 0 to 4 as the question scores.

Scoring is a pure function. It does no I/O and it does not use the model. Unit
tests cover it. The LLM generates the questions. Deterministic code calculates
the scores.

**A note about the multi-answer rule.** The specified rule counts correct
selections, and it ignores wrong selections. A user who selects all the
options therefore gets the maximum score. The rule measures recall, but it
does not measure precision. The specified rule is the default. The
`SCORING_MODE` configuration variable selects a different rule. The
`penalized` rule uses `max(0, correct - wrong)` on a scale of 0 to 4.

## Assumptions

The requirements permit more than one interpretation in some areas. These are
the decisions, and each decision is reversible:

- **The agent runs the full quiz.** The agent is more than a question
  generator inside a conventional application. One graph controls the full
  session lifecycle: generate, ask, collect, score and finalize. It uses
  human-in-the-loop pauses. A weaker interpretation is an agent for generation
  only, with CRUD for the other steps. That interpretation also meets the
  requirements, but it loses durability and a clear data flow.
- **The number of questions is configurable between 5 and 8.** The default is
  6. The generator receives an instruction to mix single-answer and
  multi-answer questions. Both scoring paths therefore get exercise.
- **Each question has exactly 4 options.** A multi-answer question has 2 or 3
  correct options. Validation rejects a multi-answer question that has 4
  correct options. Such a question cannot show the difference between
  knowledge and the select-everything strategy.
- **Correct answers stay on the server.** The interrupt payload and each API
  response remove the `isCorrect` flags. The server calculates the score when
  it receives the answer.
- **The source must be a GitHub URL.** The API accepts a GitHub blob URL and
  converts it to the raw.githubusercontent.com form. The node refuses any
  other host. The server makes the request, so an unrestricted URL lets a
  user reach an address that only the server can reach, such as a cloud
  metadata endpoint or an internal port. The restriction also rejects a
  redirect away from the permitted host. Any file on that host is acceptable,
  not only `README.md`.
- **The default is to prune source documents, not to divide them.** A README
  fits in the context window after the removal of badges, HTML and link noise.
  The `chunked` strategy is available for larger documents. Refer to
  Strategies.

## Patterns

These are the important parts of the design:

- **The agent is embedded. It is not a separate service.** LangGraph JS is a
  library. The graph therefore compiles one time at startup, in the Nest
  `AgentModule`, and Nest injects it where it is necessary. A monolith is the
  default. A separate agent service is correct only with a different scaling
  profile, different language dependencies, or a different owning team. None
  of these conditions apply to a quiz application.
- **One Postgres holds two ownership zones.** The checkpointer tables belong
  to `@langchain/langgraph-checkpoint-postgres`. That package manages their
  schema and creates them with `setup()`. They hold serialized graph state, so
  the sessions continue after a restart. The domain tables (`Quiz`,
  `Question`, `Option`, `Attempt`, `Answer`) belong to Prisma. They are the
  durable record for queries. Generation and the finalize node write them. Do
  not query the framework checkpoints for reports. Do not build session
  recovery on the relational tables, because the framework supplies it.
- **Domain writes are late. The checkpointer holds the live session.**
  Generation writes Quiz, Question and Option immediately, because a
  definition is complete when it exists. Nothing else writes to the domain
  tables until the `finalize` node writes the Attempt and all the Answers in
  one transaction. The checkpointer already makes the session durable.
  Immediate Answer writes would store the same fact two times. They would also
  leave unused rows for abandoned sessions. The cost is that SQL reports
  cannot see sessions in progress. Nothing here needs that.
- **Human input in an interrupt loop must never raise an exception.**
  LangGraph keeps the resume value in the checkpoint and sends it again on a
  retry. An exception on a malformed answer therefore makes the thread
  permanently unusable. Each invalid answer becomes a new prompt with the
  reason. This includes unknown option ids, the wrong number of selections and
  a malformed body. Only a valid answer completes a question.
- **Structured output with one repair attempt.** A Zod schema controls
  question generation. On a validation failure, the model receives the errors
  one time. A second failure stops the session with an error. The application
  does not serve a malformed quiz.
- **Progress and prose stream. Payloads arrive complete.** Node updates and
  framing tokens stream token by token. Questions and results arrive as
  complete validated objects. Streamed structured output would make the client
  parse incomplete JSON. It would also send the raw generation, which contains
  the correct answers.
- **DI tokens make the seams.** The LLM provider and the generation strategy
  are behind interfaces. Configuration selects them, not a code change. The
  default provider is Groq. Ollama is available for local runs.

## Strategies

One interface controls question generation:

| Strategy                | Approach                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- |
| `single-pass` (default) | Makes one generation call for the pruned document                            |
| `chunked`               | Divides the document by section, generates for each part, then removes duplicates and selects the target number |

The `GENERATION_STRATEGY` variable selects the strategy. To add a strategy,
write one class and add one registry entry.

## Evals

A scorecard controls the decisions about prompts and strategies. Do not
examine the output and make a judgement. The `pnpm eval` command runs each
generation strategy against a fixture set. The set contains three READMEs with
different shapes: a library, an application and a sparse document. The command
gives each generated quiz a score on two axes, and it also checks hygiene:

- **Answerability** (precision): the source document alone must answer each
  question. The question must contain no invented facts. A single-answer
  question must have exactly one defensible answer
- **Coverage** (recall): the proportion of the key topics of the document that
  the quiz includes
- **Distractor plausibility**: a wrong option must be wrong, but it must not
  be absurd

An LLM is the judge. The judge does not check structural validity.
Deterministic checks control the number of options, the number of questions
and the number of correct options. These checks run before the judge. The
application sends the results to Langfuse as dataset runs. A prompt change
therefore has a score from before the change and after it. The judge gives a
score to the generator. It never gives a score to the user.

## Quickstart

```
mise install                  # installs the Node and pnpm versions from mise.toml
docker compose up -d          # starts Postgres
cp .env.example .env          # add your GROQ_API_KEY
pnpm install
pnpm prisma migrate dev       # creates the domain tables
pnpm dev                      # API on :3000, web on :5173
pnpm eval                     # optional: gives generation quality a score
```

The checkpointer creates its own tables. Open the web interface. Give it a
Markdown URL. The `.env.example` file contains two examples. Then answer the
questions.

## Observability

The application sends traces of the generation calls to Langfuse. To enable
this, set the `LANGFUSE_*` variables in the environment. A trace contains the
source URL, the strategy, the token usage and the number of repair attempts.

## Roadmap

- **Error events over SSE.** Nodes throw typed errors (`FetchSourceError`,
  `GenerateQuestionsError`). Failure ends the run, so no error value is
  written into the graph state. `AgentService` catches the error and maps
  the error class to a new `error` member of the typed event union. The
  event carries a code and a fixed, user-safe message. The raw cause stays
  in the server log. The checkpoint stays at the last successful node, so
  a retry on the same thread resumes at the failed node. Inside the
  interrupt loop the rule does not change: an invalid answer causes a
  re-prompt, never a throw.
- **A `status` column on the `Quiz` row.** A reloaded page cannot see a
  past `error` event. The same catch site writes the failure to the domain
  table. This work waits until the web interface needs reconnect.

## Known limitations, deliberate at this scope

- **There is no authentication.** Any person with the session id can use the
  session.
- **`GET /sessions/:id` reads the graph state, not the domain tables.** This
  is sufficient for the web interface. Reports must use the Prisma tables,
  which contain completed attempts only.
- **Evals inform question quality. They do not control it.** The scorecard
  controls prompt changes during development. Generation does not reject a
  quiz with a low score. At run time, only the deterministic structural checks
  apply. A judge call during generation would double the latency and the cost
  of each session. The benefit at this scale is too small.
- **The application runs in one process.** The Postgres checkpointer permits
  horizontal scaling, but nothing here needs it.
- **`ScoringService.scoreQuestion` still validates the answer.** Validation
  and scoring are two different tasks, and they occur at different times.
  Validation must occur immediately after the answer arrives, so `askQuestion`
  can catch the error and ask the question again. Scoring can occur later. One
  method for both tasks is acceptable while `scoreAnswer` runs after each
  answer. It becomes incorrect if scoring moves to `finalize`, because the
  user then learns about a bad answer after the last question. The correction
  is a separate `validateAnswer` method. This work waits until the node
  exists.
- **HTTP tests replace `fetch`. They do not intercept it.** The tests put a
  stub in the place of the global `fetch`, so the real `fetch` never runs.
  The responses are real `Response` objects, so the status and the body
  behave correctly, but the request itself is not exercised. Headers,
  redirects and cancellation are therefore untested. `fetchSource` sends a
  URL and no options, so there is nothing to test yet. An interceptor such
  as MSW runs the real `fetch` and permits those tests. MSW also runs in the
  browser, so the web package can use the same request handlers. Add it when
  `fetchSource` takes options, or when the web package needs its first
  request test.
