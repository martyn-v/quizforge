import { randomUUID } from "node:crypto";
import { Client } from "langsmith";
import type { Fixture } from "./fixtures.ts";
import type { FixtureScore } from "./scorecard.ts";

export interface FeedbackEntry {
  key: string;
  score: number;
  comment?: string;
}

/** Maps one score row to LangSmith feedback entries. Pure. */
export function feedbackEntries(score: FixtureScore): FeedbackEntry[] {
  const metrics: Array<[string, number | null]> = [
    ["answerability", score.answerability],
    ["single_defensible", score.singleDefensible],
    ["distractor_plausibility", score.distractorPlausibility],
    ["coverage", score.coverage],
    ["multi_fraction", score.multiFraction],
    ["retries", score.retries],
    ["generation_ms", score.generationMs],
  ];
  const entries: FeedbackEntry[] = [];
  for (const [key, value] of metrics) {
    if (value !== null) {
      entries.push({ key, score: value });
    }
  }
  if (score.structuralFailures.length === 0) {
    entries.push({ key: "structural", score: 1 });
  } else {
    entries.push({
      key: "structural",
      score: 0,
      comment: score.structuralFailures.join("; "),
    });
  }
  return entries;
}

export interface UploadOptions {
  fixtures: Fixture[];
  scores: FixtureScore[];
  generator: Record<string, string | null>;
  judge: Record<string, string | null>;
  comment: string | null;
  stamp: string;
}

/**
 * Uploads one eval batch to LangSmith as an experiment. The dataset
 * holds one example per fixture. Each score row becomes one run with
 * feedback. A failure logs a warning; the eval run never fails here.
 */
export async function uploadScorecard(options: UploadOptions): Promise<void> {
  if (
    process.env.LANGSMITH_TRACING !== "true" ||
    !process.env.LANGSMITH_API_KEY
  ) {
    console.log("LangSmith upload skipped: tracing is off.");
    return;
  }
  const projectName = `eval-${options.stamp}`;
  try {
    const client = new Client();
    const datasetName = process.env.LANGSMITH_PROJECT ?? "default-evals";

    const dataset = (await client.hasDataset({ datasetName }))
      ? await client.readDataset({ datasetName })
      : await client.createDataset(datasetName, {
          description: "QuizForge eval fixtures, one example per fixture.",
        });

    // Upsert examples. The fixture id in the metadata is the key.
    const exampleIds = new Map<string, string>();
    for await (const example of client.listExamples({
      datasetId: dataset.id,
    })) {
      const fixtureId = (example.metadata as { fixtureId?: string } | null)
        ?.fixtureId;
      if (fixtureId) {
        exampleIds.set(fixtureId, example.id);
      }
    }
    for (const fixture of options.fixtures) {
      if (exampleIds.has(fixture.id)) {
        continue;
      }
      const example = await client.createExample({
        dataset_id: dataset.id,
        inputs: {
          fixtureId: fixture.id,
          shape: fixture.shape,
          url: fixture.url,
        },
        metadata: { fixtureId: fixture.id },
      });
      exampleIds.set(fixture.id, example.id);
    }

    const project = await client.createProject({
      projectName,
      referenceDatasetId: dataset.id,
      metadata: {
        generator: options.generator,
        judge: options.judge,
        comment: options.comment,
      },
    });

    // Runs first, then one flush, then feedback. createRun queues into
    // a batch; feedback needs the run to exist on the server.
    const now = Date.now();
    const runIds = new Map<string, string>();
    for (const score of options.scores) {
      const runId = randomUUID();
      runIds.set(score.fixtureId, runId);
      await client.createRun({
        id: runId,
        name: score.fixtureId,
        run_type: "chain",
        project_name: projectName,
        reference_example_id: exampleIds.get(score.fixtureId),
        inputs: { fixtureId: score.fixtureId },
        outputs: { ...score },
        start_time: now,
        end_time: now,
      });
    }
    await client.flush();

    for (const score of options.scores) {
      const runId = runIds.get(score.fixtureId);
      if (!runId) {
        continue;
      }
      for (const entry of feedbackEntries(score)) {
        await client.createFeedback({
          runId,
          sessionId: project.id,
          key: entry.key,
          score: entry.score,
          comment: entry.comment,
          feedbackSourceType: "api",
        });
      }
    }
    console.log(`LangSmith experiment uploaded: ${projectName}`);
  } catch (error) {
    console.warn(`LangSmith upload failed: ${String(error)}`);
  }
}
