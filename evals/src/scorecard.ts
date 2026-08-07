import type { EvalQuiz } from "./quiz-shape.ts";
import type { QuestionVerdict, CoverageVerdict } from "./judge.ts";
import { structuralFailures } from "./quiz-shape.ts";

export interface FixtureScore {
  fixtureId: string;
  structuralFailures: string[];
  answerability: number | null;
  singleDefensible: number | null;
  distractorPlausibility: number | null;
  coverage: number | null;
}

function fraction(hits: number, total: number): number | null {
  return total === 0 ? null : hits / total;
}

/** Folds judge verdicts into one score row for a fixture. */
export function aggregateScore(
  fixtureId: string,
  quiz: EvalQuiz,
  verdicts: QuestionVerdict[],
  coverage: CoverageVerdict | null,
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
    "structural",
  ].join("");

  const rows = scores.map((score) =>
    [
      score.fixtureId.padEnd(14),
      cell(score.answerability).padEnd(12),
      cell(score.singleDefensible).padEnd(14),
      cell(score.distractorPlausibility).padEnd(13),
      cell(score.coverage).padEnd(10),
      score.structuralFailures.length === 0
        ? "pass"
        : `${score.structuralFailures.length} failures`,
    ].join(""),
  );

  return [header, ...rows].join("\n");
}
