import "../env.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { makeGenerateQuestionsNode } from "../../../server/src/agent/nodes/generate-questions.ts";
import { buildGeneratorModel, buildJudgeModel } from "../model-factory.ts";
import { loadManifest, loadFixtureSource } from "../fixtures.ts";
import { DraftQuizSchema } from "../quiz-shape.ts";
import { judgeQuestion, judgeCoverage } from "../judge/judge.ts";
import { withRateLimitRetry } from "../rate-limit.ts";
import {
  aggregateScore,
  formatScorecard,
  type FixtureScore,
} from "../scorecard.ts";

const generator = buildGeneratorModel();
const judge = buildJudgeModel();
// TS resolves @langchain/core as ESM here and as CommonJS in server, so
// the two BaseChatModel types do not unify. The instance is compatible.
const generate = makeGenerateQuestionsNode(
  generator as unknown as Parameters<typeof makeGenerateQuestionsNode>[0],
);

const scores: FixtureScore[] = [];

for (const fixture of loadManifest()) {
  console.log(`evaluating ${fixture.id} (${fixture.shape})...`);
  const source = loadFixtureSource(fixture.id);

  const update = await withRateLimitRetry(async () =>
    generate(
      {
        readme_url: fixture.url,
        source,
        draft: undefined,
        quiz: undefined,
        answers: {},
        scores: {},
        finalScore: undefined,
        attemptId: undefined,
      },
      {} as never,
    ),
  );

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
    });
    continue;
  }

  const quiz = parsed.data;
  const verdicts = [];
  for (const question of quiz.questions) {
    verdicts.push(await judgeQuestion(judge, source, question));
  }
  const coverage = await judgeCoverage(judge, source, quiz);
  scores.push(aggregateScore(fixture.id, quiz, verdicts, coverage));
}

// "provider default" means the variable is unset and the model uses its
// own default. The judge defaults are set in buildJudgeModel.
const generatorInfo = {
  provider: process.env.LLM_PROVIDER ?? "ollama",
  strategy: process.env.GENERATION_STRATEGY ?? "single-pass",
  ollamaModel: process.env.OLLAMA_MODEL ?? "gemma4:31b",
  groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  temperature: process.env.LLM_TEMPERATURE || "provider default",
  think: process.env.LLM_THINK || "provider default",
};
const judgeInfo = {
  provider: process.env.JUDGE_PROVIDER ?? "ollama",
  ollamaModel: process.env.JUDGE_OLLAMA_MODEL ?? null,
  groqModel: process.env.JUDGE_GROQ_MODEL ?? null,
  temperature: process.env.JUDGE_TEMPERATURE || "0",
  think: process.env.JUDGE_THINK || "false",
};

const generatorModel =
  generatorInfo.provider === "groq"
    ? generatorInfo.groqModel
    : generatorInfo.ollamaModel;
const judgeModel =
  judgeInfo.provider === "groq" ? judgeInfo.groqModel : judgeInfo.ollamaModel;

console.log(
  `\ngenerator: ${generatorInfo.provider}/${generatorModel} ` +
    `(${generatorInfo.strategy}, temperature=${generatorInfo.temperature}, think=${generatorInfo.think})`,
);
console.log(
  `judge: ${judgeInfo.provider}/${judgeModel} ` +
    `(temperature=${judgeInfo.temperature}, think=${judgeInfo.think})`,
);
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
    { timestamp: stamp, generator: generatorInfo, judge: judgeInfo, scores },
    null,
    2,
  ),
);
console.log(`results written to ${resultPath}`);
