import type { DraftQuiz } from "./quiz-shape.ts";
import type { QuestionVerdict, CoverageVerdict } from "./judge/judge.ts";
import { structuralFailures } from "./quiz-shape.ts";

export interface FixtureScore {
  fixtureId: string;
  structuralFailures: string[];
  answerability: number | null;
  singleDefensible: number | null;
  distractorPlausibility: number | null;
  coverage: number | null;
  /** The share of multi-answer questions; null when no quiz exists. */
  multiFraction: number | null;
  /** Repair rounds generation needed; null when generation failed. */
  retries: number | null;
}

function fraction(hits: number, total: number): number | null {
  return total === 0 ? null : hits / total;
}

/** Folds judge verdicts into one score row for a fixture. */
export function aggregateScore(
  fixtureId: string,
  quiz: DraftQuiz,
  verdicts: QuestionVerdict[],
  coverage: CoverageVerdict | null,
  retries: number | null,
): FixtureScore {
  const singles = quiz.questions
    .map((question, index) => ({ question, verdict: verdicts[index] }))
    .filter(({ question, verdict }) => question.type === "single" && verdict);

  const key = new Set(coverage?.keyTopics ?? []);
  const covered = (coverage?.coveredTopics ?? []).filter((topic) =>
    key.has(topic),
  );

  return {
    fixtureId,
    structuralFailures: structuralFailures(quiz),
    answerability: fraction(
      verdicts.filter((v) => v.answerable).length,
      verdicts.length,
    ),
    singleDefensible: fraction(
      singles.filter(({ verdict }) => verdict.singleDefensibleAnswer).length,
      singles.length,
    ),
    distractorPlausibility: fraction(
      verdicts.filter((v) => v.distractorsPlausible).length,
      verdicts.length,
    ),
    coverage: coverage ? fraction(covered.length, key.size) : null,
    multiFraction: fraction(
      quiz.questions.filter((q) => q.type === "multi").length,
      quiz.questions.length,
    ),
    retries,
  };
}

function cell(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

/** Renders score rows as a fixed-width text table. */
export function formatScorecard(scores: FixtureScore[]): string {
  const header = [
    "fixture".padEnd(14),
    "answerable".padEnd(12),
    "1-defensible".padEnd(14),
    "distractors".padEnd(13),
    "coverage".padEnd(10),
    "multi".padEnd(7),
    "retries".padEnd(9),
    "structural",
  ].join("");

  const rows = scores.map((score) =>
    [
      score.fixtureId.padEnd(14),
      cell(score.answerability).padEnd(12),
      cell(score.singleDefensible).padEnd(14),
      cell(score.distractorPlausibility).padEnd(13),
      cell(score.coverage).padEnd(10),
      cell(score.multiFraction).padEnd(7),
      (score.retries === null ? "n/a" : String(score.retries)).padEnd(9),
      score.structuralFailures.length === 0
        ? "pass"
        : `${score.structuralFailures.length} failures`,
    ].join(""),
  );

  return [header, ...rows].join("\n");
}
