/**
 * Scoring strategies for multi-answer questions.
 *
 * Single-answer questions use a fixed rule. A correct answer scores 4 and a
 * wrong answer scores 0. `ScoringService` contains that rule.
 *
 * Multi-answer questions use one of the strategies in this file. The task
 * specification defines one rule. That rule has two properties that this file
 * makes explicit. The rule is therefore behind a seam, and is not hardcoded.
 *
 * The `SCORING_MODE` environment variable selects the strategy.
 * `scoringModeProvider` reads that variable once at startup.
 * `ScoringService` receives the selected function. `ScoringService` does not
 * read the configuration. Scoring stays a pure function of its inputs.
 *
 * ## Two properties of the specified rule
 *
 * **The rule ignores wrong selections.** It counts the correct selections
 * only. It measures recall, but it does not measure precision. A user who
 * selects all the options gets the maximum score.
 *
 * **The maximum score changes with the question.** The rule scores the count
 * of correct selections. A question with one correct option gives a maximum
 * of 1. A question with three correct options gives a maximum of 3.
 * `ScoringService.finalScore` calculates a weighted average of these scores.
 * The average is therefore not correct. A user who answers every question
 * correctly gets approximately 2 out of 4.
 *
 * `SPEC` keeps both properties. `SPEC` is the specified rule and the default.
 * The other strategies correct one property or both properties. They make the
 * comparison possible.
 *
 * ## Comparison
 *
 * The table uses a question with four options. The correct options are A and
 * B. The value of `totalCorrect` is 2.
 *
 * | Selection      | hits | misses | SPEC | SCALED | PENALIZED |
 * | -------------- | ---- | ------ | ---- | ------ | --------- |
 * | A, B (perfect) | 2    | 0      | 2    | 4      | 4         |
 * | A, B, C        | 2    | 1      | 2    | 4      | 2         |
 * | A only         | 1    | 0      | 1    | 2      | 2         |
 * | A, B, C, D     | 2    | 2      | 2    | 4      | 0         |
 * | C, D           | 0    | 2      | 0    | 0      | 0         |
 *
 * Two rows show the difference between the strategies. Row `A, B, C, D` shows
 * a user who selects all the options. `SPEC` gives the maximum score and
 * `SCALED` gives 4. `PENALIZED` gives 0. Row `A, B` shows a correct answer.
 * `SCALED` and `PENALIZED` give 4. `SPEC` gives 2.
 *
 * `PENALIZED` is the only strategy that does both. It gives 4 for a correct
 * answer, and it gives a low score to a user who selects all the options.
 * `SCALED` corrects the maximum score only. `SCALED` is a different scale for
 * the specified rule, and it is not a correction for the first property.
 *
 * @see ScoringService.finalScore for the calculation of the final score.
 */

/**
 * The available scoring strategies for multi-answer questions.
 *
 * The `SCORING_MODE` environment variable selects one of these values. The
 * values are the strings that the configuration accepts. `scoringModeProvider`
 * rejects an unknown value at startup. An unknown value does not cause an
 * error during a quiz.
 */
export enum MultipleChoiceScoringMode {
  /**
   * The specified rule. The score is the count of correct selections. The
   * rule ignores wrong selections, so a user who selects all the options
   * gets the maximum score. The maximum score changes with the question.
   * This is the default.
   */
  SPEC = "spec",

  /**
   * The specified rule on a scale of 0 to 4. A correct answer always scores
   * 4. The number of correct options does not change the maximum score. The
   * rule still ignores wrong selections. A user who selects all the options
   * still gets 4.
   */
  SCALED = "scaled",

  /**
   * Wrong selections subtract from correct selections. The result is on a
   * scale of 0 to 4. The strategy measures precision and recall. The minimum
   * score is 0. A negative score is not possible, because a negative score
   * would decrease the weighted average of the other questions.
   */
  PENALIZED = "penalized",
}

/**
 * Calculates the score of one multi-answer question. The score is between 0
 * and 4.
 *
 * The function receives three counts. It does not receive the sets of option
 * identifiers. A strategy does not examine option identifiers. Counts make
 * each strategy a short calculation that is easy to read and to test.
 *
 * `ScoringService` validates the answer before it calls a strategy. A strategy
 * can therefore assume that the counts are correct.
 *
 * @param hits The number of correct options that the user selected.
 * @param misses The number of selected options that are not correct.
 * @param totalCorrect The number of correct options in the question. The
 *   value includes correct options that the user did not select. The minimum
 *   value is 1. The strategies use this value to calculate a score between 0
 *   and 4.
 * @returns A score between 0 and 4.
 */
export type MultipleChoiceScoringStrategy = (
  hits: number,
  misses: number,
  totalCorrect: number,
) => number;

/**
 * The strategies that `scoringModeProvider` selects from.
 *
 * The type of the record uses the full enum as its key. If you add a value to
 * `MultipleChoiceScoringMode` and you do not add a strategy, the compiler
 * gives an error. The application does not start with a missing strategy.
 */
export const MULTIPLE_CHOICE_SCORING_STRATEGY: Record<
  MultipleChoiceScoringMode,
  MultipleChoiceScoringStrategy
> = {
  /**
   * `hits`
   *
   * The strategy ignores `misses`. A user who selects all the options
   * therefore gets the maximum score. The strategy does not use
   * `totalCorrect`, so the maximum score is `totalCorrect` and not 4. Both
   * properties agree with the specification. The other strategies correct
   * them.
   */
  [MultipleChoiceScoringMode.SPEC]: (hits, _misses, _totalCorrect) => {
    return hits;
  },

  /**
   * `hits / totalCorrect * 4`
   *
   * The score is the proportion of correct options that the user found, on a
   * scale of 0 to 4. The strategy corrects the maximum score. It does not
   * correct the other property, because it still ignores `misses`. A user who
   * selects all the options still gets 4.
   */
  [MultipleChoiceScoringMode.SCALED]: (hits, _misses, totalCorrect) => {
    return (hits / totalCorrect) * 4;
  },

  /**
   * `max(0, hits - misses) / totalCorrect * 4`
   *
   * The score is the number of correct selections minus the number of wrong
   * selections, on a scale of 0 to 4.
   *
   * The minimum of 0 is necessary. `finalScore` calculates a weighted average
   * of the question scores. A negative score for one question would decrease
   * the score of the other questions.
   *
   * The scale of 0 to 4 is also necessary. Without it, a correct answer
   * scores 1 on a question with one correct option, and 3 on a question with
   * three correct options. The average of these scores gives approximately 2
   * out of 4 for a quiz that the user answered correctly.
   */
  [MultipleChoiceScoringMode.PENALIZED]: (hits, misses, totalCorrect) => {
    return (Math.max(0, hits - misses) / totalCorrect) * 4;
  },
};
