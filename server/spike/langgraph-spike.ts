/**
 * THROWAWAY SPIKE. Not imported by application code.
 *
 * Verifies the LangGraph JS API surface the quiz agent depends on, against
 * a real Postgres, before any real code gets written:
 *
 *   1. interrupt() pauses a node and surfaces a payload under __interrupt__
 *   2. Command({ resume }) feeds a value back into that same interrupt call
 *   3. conditional edges drive the ask -> score -> ask loop
 *   4. PostgresSaver.setup() creates its tables and state survives a fresh
 *      graph instance on the same thread_id (the process-restart story)
 *   5. streamEvents() emits node-level events usable for progress streaming
 *   6. WEDGE TEST: throwing inside the interrupt loop permanently wedges the
 *      thread, because the cached resume value replays on every retry
 *
 * Run: pnpm --filter server spike   (needs Postgres on DATABASE_URL)
 */
import {
  Annotation,
  Command,
  END,
  START,
  StateGraph,
  interrupt,
  isInterrupted,
} from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/quizforge';

const results: { check: string; ok: boolean; note: string }[] = [];

function record(check: string, ok: boolean, note: string) {
  results.push({ check, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}\n      ${note}`);
}

// --- shared state shape, deliberately quiz-shaped ------------------------

const QuizState = Annotation.Root({
  questions: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  index: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  answers: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  score: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),
});

/** Stands in for the LLM generation node. No model call in a spike. */
function buildQuizGraph() {
  return new StateGraph(QuizState)
    .addNode('generate', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { questions: ['2+2?', 'capital of France?'], index: 0 };
    })
    .addNode('ask', (state) => {
      // interrupt payload is what the client would receive, minus answers
      const answer = interrupt<{ question: string; index: number }, string>({
        question: state.questions[state.index],
        index: state.index,
      });
      return { answers: [answer] };
    })
    // NB: node names must not collide with state channel names, so this
    // cannot be called 'score' while `score` is a channel.
    .addNode('scoreAnswer', (state) => {
      const expected = ['4', 'paris'];
      const given = state.answers[state.index]?.toLowerCase().trim();
      return {
        score: given === expected[state.index] ? 1 : 0,
        index: state.index + 1,
      };
    })
    .addNode('finalize', (state) => {
      console.log(
        `      finalize: ${state.score}/${state.questions.length} correct`,
      );
      return {};
    })
    .addEdge(START, 'generate')
    .addEdge('generate', 'ask')
    .addEdge('ask', 'scoreAnswer')
    .addConditionalEdges(
      'scoreAnswer',
      (state) => (state.index < state.questions.length ? 'ask' : 'finalize'),
      { ask: 'ask', finalize: 'finalize' },
    )
    .addEdge('finalize', END);
}

async function main() {
  // --- 4a. PostgresSaver.setup() ----------------------------------------
  const checkpointer = PostgresSaver.fromConnString(DATABASE_URL);
  await checkpointer.setup();
  record(
    'PostgresSaver.setup()',
    true,
    'idempotent, created checkpointer tables in the public schema',
  );

  const graph = buildQuizGraph().compile({ checkpointer });
  const threadId = `spike-${process.pid}`;
  const config = { configurable: { thread_id: threadId } };

  // --- 1. first interrupt ------------------------------------------------
  const first = await graph.invoke({}, config);
  const firstInterrupt = isInterrupted<{ question: string; index: number }>(
    first,
  )
    ? first.__interrupt__[0]?.value
    : undefined;
  record(
    'interrupt() pauses and surfaces payload',
    firstInterrupt?.question === '2+2?',
    `__interrupt__[0].value = ${JSON.stringify(firstInterrupt)}`,
  );

  // --- 5. streamEvents() during a resume ---------------------------------
  const seenNodes = new Set<string>();
  const seenEventTypes = new Set<string>();
  const stream = graph.streamEvents(new Command({ resume: '4' }), {
    ...config,
    version: 'v2',
  });
  for await (const event of stream) {
    seenEventTypes.add(event.event);
    if (event.event === 'on_chain_start' && event.name) {
      seenNodes.add(event.name);
    }
  }
  record(
    'streamEvents() emits node-level events',
    seenNodes.has('ask') && seenNodes.has('scoreAnswer'),
    `nodes seen: ${[...seenNodes].filter((n) => ['ask', 'scoreAnswer', 'finalize', 'generate'].includes(n)).join(', ')} | event types: ${[...seenEventTypes].slice(0, 4).join(', ')}...`,
  );

  // --- 2 + 3. resume fed back in, conditional edge looped ----------------
  const afterFirstAnswer = await graph.getState(config);
  const secondInterrupt = afterFirstAnswer.tasks[0]?.interrupts?.[0]?.value as
    | { question: string; index: number }
    | undefined;
  record(
    'Command({ resume }) + conditional edge loop',
    secondInterrupt?.question === 'capital of France?' &&
      afterFirstAnswer.values.answers.length === 1,
    `answer 1 stored, score=${afterFirstAnswer.values.score}, looped back to ask with: ${JSON.stringify(secondInterrupt)}`,
  );

  // --- 4b. state survives a brand new graph + checkpointer instance ------
  const freshCheckpointer = PostgresSaver.fromConnString(DATABASE_URL);
  const freshGraph = buildQuizGraph().compile({
    checkpointer: freshCheckpointer,
  });
  const resumedState = await freshGraph.getState(config);
  const finished = await freshGraph.invoke(
    new Command({ resume: 'Paris' }),
    config,
  );
  record(
    'checkpoint survives a fresh graph instance',
    resumedState.values.answers.length === 1 && finished.score === 2,
    `fresh instance read thread ${threadId}, finished run with score=${finished.score}, answers=${JSON.stringify(finished.answers)}`,
  );

  // --- 6. THE WEDGE TEST -------------------------------------------------
  // A node that throws on a malformed answer. AGENTS.md hard rule 1 claims
  // this wedges the thread forever. Prove it rather than trusting it.
  const wedgeGraph = new StateGraph(QuizState)
    .addNode('ask', (state) => {
      const answer = interrupt<{ question: string }, string>({
        question: 'pick a or b',
      });
      if (answer !== 'a' && answer !== 'b') {
        throw new Error(`invalid answer: ${answer}`);
      }
      return { answers: [answer], index: state.index + 1 };
    })
    .addEdge(START, 'ask')
    .addEdge('ask', END)
    .compile({ checkpointer });

  const wedgeConfig = {
    configurable: { thread_id: `spike-wedge-${process.pid}` },
  };
  await wedgeGraph.invoke({}, wedgeConfig);

  let firstFailure = '';
  try {
    await wedgeGraph.invoke(new Command({ resume: 'z' }), wedgeConfig);
  } catch (err) {
    firstFailure = (err as Error).message;
  }

  // Now try to recover with a VALID answer on the same thread.
  let recovered = false;
  let secondFailure = '';
  try {
    const out = await wedgeGraph.invoke(
      new Command({ resume: 'a' }),
      wedgeConfig,
    );
    recovered = out.answers?.includes('a') ?? false;
  } catch (err) {
    secondFailure = (err as Error).message;
  }

  record(
    'WEDGE: throwing inside the interrupt loop is unrecoverable',
    !recovered,
    recovered
      ? 'thread recovered on retry, so the replay-on-retry hazard did NOT reproduce here'
      : `retry with a valid answer still failed: "${secondFailure}" (first failure: "${firstFailure}") -> the cached resume value replayed, thread is stuck`,
  );

  // Control: the re-prompt strategy on a clean thread does recover.
  const safeGraph = new StateGraph(QuizState)
    .addNode('ask', (state) => {
      let reason = '';
      // never throw: loop on the interrupt until the answer validates
      for (;;) {
        const answer = interrupt<{ question: string; reason: string }, string>({
          question: 'pick a or b',
          reason,
        });
        if (answer === 'a' || answer === 'b') {
          return { answers: [answer], index: state.index + 1 };
        }
        reason = `"${answer}" is not a or b`;
      }
    })
    .addEdge(START, 'ask')
    .addEdge('ask', END)
    .compile({ checkpointer });

  const safeConfig = {
    configurable: { thread_id: `spike-safe-${process.pid}` },
  };
  await safeGraph.invoke({}, safeConfig);
  const afterBad = await safeGraph.invoke(
    new Command({ resume: 'z' }),
    safeConfig,
  );
  const rePromptReason = isInterrupted<{ question: string; reason: string }>(
    afterBad,
  )
    ? afterBad.__interrupt__[0]?.value?.reason
    : undefined;
  const afterGood = await safeGraph.invoke(
    new Command({ resume: 'b' }),
    safeConfig,
  );
  record(
    'CONTROL: re-prompting instead of throwing recovers',
    afterGood.answers?.includes('b') ?? false,
    `bad answer re-prompted with reason "${rePromptReason}", then accepted "b" -> answers=${JSON.stringify(afterGood.answers)}`,
  );

  await checkpointer.end?.();
  await freshCheckpointer.end?.();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('spike crashed:', err);
  process.exitCode = 1;
});
