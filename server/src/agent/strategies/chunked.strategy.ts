import { SystemMessage, HumanMessage } from "@langchain/core/messages";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { DraftQuestion } from "@quizforge/shared";
import { ChunkQuizSchema } from "../agent.schemas";
import { GenerateQuestionsError } from "../../common/errors";
import { invokeWithRepair } from "./invoke-with-repair";
import { splitMarkdownSections, type SplitOptions } from "./markdown-sections";
import { makeSinglePassStrategy } from "./single-pass.strategy";
import {
  GenerationStrategy,
  type GenerationResult,
  type QuizGenerationStrategy,
} from "./generation-strategy";

/** The whole-quiz size bounds, from GeneratedQuizSchema. */
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 8;

function chunkSystemPrompt(count: number): string {
  return `
You are a quiz generator that generates quiz questions for one section of a larger document.
The section is in Markdown format.
Generate questions that are clear, concise, and relevant to the content of the section.

Rules:
- Generate up to ${count} questions.
- Generate fewer questions when the section cannot support ${count} well-grounded questions.
- Every question must be answerable from this section alone.
- Each question must have exactly 4 options.
- The 4 options of a question must be distinct.
- Each question must be either a single-choice question (type "single") or a multiple-choice question (type "multi").
- Prefer a mix of single-choice and multiple-choice questions.
- Single-choice questions must have exactly 1 correct option.
- Multiple-choice questions must have 2 or 3 correct options.
- Multiple-choice questions must not leak the number of correct options in the question text.
- Ask about the content of the section, not about the document itself or its formatting.
- Options marked as correct must be the only defensible answers based on the section.
- Incorrect options must be plausible to a reader who has not read the section closely.
- Do not use options such as "All of the above" or "None of the above".
- The questions and options must be grammatically correct and free of spelling errors.
- The questions and options must be in English.
- Base the quiz title and description on this section, but keep them general enough to fit the whole document.
`;
}

/**
 * Lowercases the text and reduces it to its words, so a duplicate that
 * differs only in case or punctuation still matches.
 */
function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Divides the document by section, generates questions for each section,
 * removes duplicates, and selects at most 8 questions spread across the
 * sections. A document with one section gets one whole-document call,
 * because one section cannot fill the 5-question minimum on its own.
 */
export function makeChunkedStrategy(options?: {
  maxAttempts?: number;
  split?: SplitOptions;
}): QuizGenerationStrategy {
  const maxAttempts = options?.maxAttempts ?? 2;

  return {
    name: GenerationStrategy.CHUNKED,
    async generate(
      llm: BaseChatModel,
      source: string,
    ): Promise<GenerationResult> {
      const sections = splitMarkdownSections(source, options?.split);
      if (sections.length < 2) {
        return makeSinglePassStrategy(maxAttempts).generate(llm, source);
      }

      // Enough questions per section to overshoot the maximum a little,
      // so deduplication does not pull the total under the minimum.
      const perSection = Math.min(
        4,
        Math.max(2, Math.ceil(MAX_QUESTIONS / sections.length)),
      );

      let retries = 0;
      const chunks = [];
      for (const section of sections) {
        const { value, retries: sectionRetries } = await invokeWithRepair(
          llm,
          ChunkQuizSchema,
          [
            new SystemMessage(chunkSystemPrompt(perSection)),
            new HumanMessage(section),
          ],
          maxAttempts,
        );
        retries += sectionRetries;
        chunks.push(value);
      }

      // Deduplicate while keeping each question's position, so the
      // selection below can spread by section and restore document order.
      const seen = new Set<string>();
      const unique: {
        question: DraftQuestion;
        section: number;
        index: number;
      }[] = [];
      chunks.forEach((chunk, section) => {
        chunk.questions.forEach((question, index) => {
          const key = normalizeQuestionText(question.text);
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          unique.push({ question, section, index });
        });
      });

      if (unique.length < MIN_QUESTIONS) {
        // The message crosses the wire in error responses, so it names
        // the count and not the question texts (AGENTS.md rule 2).
        throw new GenerateQuestionsError(
          `Chunked generation produced ${unique.length} unique questions; the quiz needs at least ${MIN_QUESTIONS}`,
        );
      }

      // Round-robin over the sections, so a cut hits every section
      // evenly instead of dropping the last sections whole.
      const bySection = sections.map<typeof unique>(() => []);
      for (const entry of unique) {
        bySection[entry.section].push(entry);
      }
      const cap = Math.min(MAX_QUESTIONS, unique.length);
      const selected: typeof unique = [];
      for (let round = 0; selected.length < cap; round++) {
        for (const list of bySection) {
          if (round < list.length && selected.length < cap) {
            selected.push(list[round]);
          }
        }
      }
      selected.sort((a, b) => a.section - b.section || a.index - b.index);

      return {
        draft: {
          title: chunks[0].title,
          description: chunks[0].description,
          questions: selected.map((entry) => entry.question),
        },
        generationRetries: retries,
      };
    },
  };
}
