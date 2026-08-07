import "../env.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { makeGenerateQuestionsNode } from "../../../server/src/agent/nodes/generate-questions.ts";
import { buildGeneratorModel, buildJudgeModel } from "../model-factory.ts";
import { loadManifest, loadFixtureSource } from "../fixtures.ts";
import { EvalQuizSchema } from "../quiz-shape.ts";
import { judgeQuestion, judgeCoverage } from "../judge/judge.ts";
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

  const update = await generate(
    { readme_url: fixture.url, source, quiz: undefined },
    {} as never,
  );

  const parsed = EvalQuizSchema.safeParse((update as { quiz: unknown }).quiz);
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

console.log(`\n${formatScorecard(scores)}\n`);

const resultsDir = join(
  dirname(fileURLToPath(import.meta.url)),
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
      generator: {
        provider: process.env.LLM_PROVIDER ?? "ollama",
        strategy: process.env.GENERATION_STRATEGY ?? "single-pass",
        ollamaModel: process.env.OLLAMA_MODEL ?? "gemma4:31b",
        groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      },
      judge: {
        provider: process.env.JUDGE_PROVIDER ?? "ollama",
        ollamaModel: process.env.JUDGE_OLLAMA_MODEL ?? null,
        groqModel: process.env.JUDGE_GROQ_MODEL ?? null,
      },
      scores,
    },
    null,
    2,
  ),
);
console.log(`results written to ${resultPath}`);
