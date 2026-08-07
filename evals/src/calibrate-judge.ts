import "./env";
import { buildJudgeModel } from "./model-factory";
import { judgeQuestion } from "./judge";
import { loadFixtureSource } from "./fixtures";
import { negatives } from "./negatives";
import { calibrationFailures, type CalibrationResult } from "./calibration";

const judge = buildJudgeModel();
const results: CalibrationResult[] = [];

for (const negative of negatives) {
  const source = loadFixtureSource(negative.fixtureId);
  const verdict = await judgeQuestion(judge, source, negative.question);
  const caught = !verdict[negative.mustFail];
  console.log(
    `${caught ? "caught" : "MISSED"} ${negative.fixtureId}: ${negative.note}`,
  );
  results.push({ negative, verdict });
}

const failures = calibrationFailures(results);
if (failures.length > 0) {
  console.error(`\nJudge calibration failed:`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
console.log(
  `\nJudge calibration passed: ${negatives.length}/${negatives.length} negatives caught`,
);
