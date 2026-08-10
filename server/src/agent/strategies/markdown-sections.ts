/**
 * The defaults for splitMarkdownSections, sized for a README. A section
 * below the minimum has too little material for its own questions. The
 * section cap bounds the number of LLM calls the chunked strategy makes.
 */
export const DEFAULT_MIN_SECTION_CHARS = 400;
export const DEFAULT_MAX_SECTIONS = 6;

export interface SplitOptions {
  minChars?: number;
  maxSections?: number;
}

/**
 * Splits a Markdown document into sections on its level-1 and level-2
 * headings. Deeper headings stay with their parent section. A heading
 * inside a fenced code block is data, not structure, so it does not
 * split (the capturing split mirrors cleanMarkdown in fetch-source.ts).
 *
 * A section smaller than minChars merges with its neighbour, so every
 * returned section carries enough material for a question. When more
 * than maxSections remain, the smallest section merges with its smaller
 * neighbour until the count fits. Order is always preserved.
 */
export function splitMarkdownSections(
  markdown: string,
  options: SplitOptions = {},
): string[] {
  const minChars = options.minChars ?? DEFAULT_MIN_SECTION_CHARS;
  const maxSections = options.maxSections ?? DEFAULT_MAX_SECTIONS;

  // A capturing split puts the fenced blocks at the odd indexes.
  const parts = markdown.split(/(```[\s\S]*?```)/);
  const sections: string[] = [""];
  for (const [index, part] of parts.entries()) {
    if (index % 2 === 1) {
      sections[sections.length - 1] += part;
      continue;
    }
    const pieces = part.split(/^(?=#{1,2} )/m);
    sections[sections.length - 1] += pieces[0];
    sections.push(...pieces.slice(1));
  }

  const trimmed = sections.map((s) => s.trim()).filter((s) => s.length > 0);

  // A small section merges into the section before it. A small leading
  // section merges the other way: the next section appends to it.
  const merged: string[] = [];
  for (const section of trimmed) {
    const last = merged[merged.length - 1];
    if (last !== undefined && (section.length < minChars || last.length < minChars)) {
      merged[merged.length - 1] = `${last}\n${section}`;
    } else {
      merged.push(section);
    }
  }

  while (merged.length > maxSections) {
    let smallest = 0;
    for (let i = 1; i < merged.length; i++) {
      if (merged[i].length < merged[smallest].length) smallest = i;
    }
    const left = smallest > 0 ? merged[smallest - 1].length : Infinity;
    const right =
      smallest < merged.length - 1 ? merged[smallest + 1].length : Infinity;
    const at = right < left ? smallest : smallest - 1;
    merged.splice(at, 2, `${merged[at]}\n${merged[at + 1]}`);
  }

  return merged;
}
