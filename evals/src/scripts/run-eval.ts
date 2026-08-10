import "../env.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { makeGenerateQuestionsNode } from "../../../server/src/agent/nodes/generate-questions.ts";
import { GENERATION_STRATEGIES } from "../../../server/src/agent/strategies/registry.ts";
import type { GenerationStrategy } from "../../../server/src/agent/strategies/generation-strategy.ts";
import { GenerateQuestionsError } from "../../../server/src/common/errors.ts";
import { buildGeneratorModel, buildJudgeModel } from "../model-factory.ts";
import { loadManifest, loadFixtureSource } from "../fixtures.ts";
import { DraftQuizSchema } from "../quiz-shape.ts";
import { judgeQuestion, judgeCoverage } from "../judge/judge.ts";
import { withRateLimitRetry } from "../rate-limit.ts";
import { uploadScorecard } from "../langsmith-upload.ts";
import {
  aggregateScore,
  formatScorecard,
  type FixtureScore,
} from "../scorecard.ts";

// An optional free-text description of the run, stamped into the
// results JSON: pnpm eval "before the mix prompt change".
const comment = process.argv[2] ?? null;

// "provider default" means the variable is unset and the model uses its
// own default. The judge defaults are set in buildJudgeModel. The model
// field holds the model of the active provider.
const generatorProvider = process.env.LLM_PROVIDER ?? "ollama";
const generatorInfo = {
  provider: generatorProvider,
  strategy: process.env.GENERATION_STRATEGY ?? "single-pass",
  model:
    generatorProvider === "groq"
      ? (process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile")
      : (process.env.OLLAMA_MODEL ?? "gemma4:31b"),
  temperature: process.env.LLM_TEMPERATURE || "provider default",
  think: process.env.LLM_THINK || "provider default",
};
const judgeProvider = process.env.JUDGE_PROVIDER ?? "ollama";
const judgeInfo = {
  provider: judgeProvider,
  model:
    judgeProvider === "groq"
      ? (process.env.JUDGE_GROQ_MODEL ?? null)
      : (process.env.JUDGE_OLLAMA_MODEL ?? null),
  temperature: process.env.JUDGE_TEMPERATURE || "0",
  think: process.env.JUDGE_THINK || "false",
};

console.log(
  `generator: ${generatorInfo.provider}/${generatorInfo.model} ` +
    `(${generatorInfo.strategy}, temperature=${generatorInfo.temperature}, think=${generatorInfo.think})`,
);
console.log(
  `judge: ${judgeInfo.provider}/${judgeInfo.model} ` +
    `(temperature=${judgeInfo.temperature}, think=${judgeInfo.think})\n`,
);

const generator = buildGeneratorModel();
const judge = buildJudgeModel();
// The same registry the server resolves from, so the strategy label in
// the results JSON always names the code that ran.
const strategy =
  GENERATION_STRATEGIES[generatorInfo.strategy as GenerationStrategy];
if (!strategy) {
  throw new Error(
    `Unknown GENERATION_STRATEGY: ${generatorInfo.strategy}. Valid strategies are ${Object.keys(
      GENERATION_STRATEGIES,
    ).join(", ")}`,
  );
}
// TS resolves @langchain/core as ESM here and as CommonJS in server, so
// the two BaseChatModel types do not unify. The instance is compatible.
const generate = makeGenerateQuestionsNode(
  generator as unknown as Parameters<typeof makeGenerateQuestionsNode>[0],
  strategy,
);

const scores: FixtureScore[] = [];

const fixtures = loadManifest();

for (const fixture of fixtures) {
  console.log(`evaluating ${fixture.id} (${fixture.shape})...`);
  const source = loadFixtureSource(fixture.id);

  // The wall-clock time of the successful generation attempt, repair
  // rounds included. The timer sits inside the retry wrapper, so a
  // rate-limit wait never counts as generation latency.
  let generationMs: number | null = null;
  let update: unknown;
  try {
    update = await withRateLimitRetry(async () => {
      const startedAt = performance.now();
      const result = await generate(
        {
          readme_url: fixture.url,
          source,
          draft: undefined,
          generationRetries: undefined,
          quiz: undefined,
          startedAt: undefined,
          answers: {},
          scores: {},
          finalScore: undefined,
          attemptId: undefined,
        },
        {} as never,
      );
      generationMs = Math.round(performance.now() - startedAt);
      return result;
    });
  } catch (error) {
    // A fixture that fails generation scores as a failure. It must not
    // end the run: the other fixtures still produce a scorecard.
    if (!(error instanceof GenerateQuestionsError)) {
      throw error;
    }
    const reason = error.message.split("\n")[0].slice(0, 200);
    console.warn(`generation failed for ${fixture.id}: ${reason}`);
    scores.push({
      fixtureId: fixture.id,
      structuralFailures: [`generation failed: ${reason}`],
      answerability: null,
      singleDefensible: null,
      distractorPlausibility: null,
      coverage: null,
      multiFraction: null,
      retries: null,
      generationMs: null,
    });
    continue;
  }

  const parsed = DraftQuizSchema.safeParse(
    (update as { draft: unknown }).draft,
  );
  if (!parsed.success) {
    scores.push({
      fixtureId: fixture.id,
      structuralFailures: ["quiz does not match the eval quiz shape"],
      answerability: null,
      singleDefensible: null,
      distractorPlausibility: null,
      coverage: null,
      multiFraction: null,
      retries: null,
      generationMs,
    });
    continue;
  }

  const quiz = parsed.data;
  const verdicts = [];
  for (const question of quiz.questions) {
    verdicts.push(await judgeQuestion(judge, source, question));
  }
  const coverage = await judgeCoverage(judge, source, quiz);
  const retries =
    (update as { generationRetries?: number }).generationRetries ?? null;
  scores.push(
    aggregateScore(fixture.id, quiz, verdicts, coverage, retries, generationMs),
  );
}

console.log(`\n${formatScorecard(scores)}\n`);

const resultsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "results",
);
mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-");
const resultPath = join(resultsDir, `${stamp}.json`);
writeFileSync(
  resultPath,
  JSON.stringify(
    {
      timestamp: stamp,
      comment,
      generator: generatorInfo,
      judge: judgeInfo,
      scores,
    },
    null,
    2,
  ),
);
console.log(`results written to ${resultPath}`);

await uploadScorecard({
  fixtures,
  scores,
  generator: generatorInfo,
  judge: judgeInfo,
  comment,
  stamp,
});
