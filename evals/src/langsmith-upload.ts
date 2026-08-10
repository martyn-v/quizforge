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
