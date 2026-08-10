import { splitMarkdownSections } from "./markdown-sections";

// Small bounds keep the fixtures readable. The defaults are for real
// READMEs and would force multi-hundred-character fixtures here.
const opts = { minChars: 10, maxSections: 6 };

describe("splitMarkdownSections", () => {
  it("returns the whole document when there are no headings", () => {
    const source = "Just a paragraph of prose.\n\nAnd another one.";

    expect(splitMarkdownSections(source, opts)).toEqual([source]);
  });

  it("splits on level-1 and level-2 headings", () => {
    const source = [
      "# Title",
      "Intro paragraph.",
      "## Install",
      "Install instructions.",
      "## Usage",
      "Usage instructions.",
    ].join("\n");

    expect(splitMarkdownSections(source, opts)).toEqual([
      "# Title\nIntro paragraph.",
      "## Install\nInstall instructions.",
      "## Usage\nUsage instructions.",
    ]);
  });

  it("keeps level-3 subsections with their parent section", () => {
    const source = [
      "## Usage",
      "Usage instructions.",
      "### Advanced",
      "Advanced instructions.",
    ].join("\n");

    expect(splitMarkdownSections(source, opts)).toEqual([source]);
  });

  it("does not split on a heading inside a fenced code block", () => {
    const source = [
      "## Example",
      "```md",
      "# not a heading",
      "## also not a heading",
      "```",
      "The code above is data.",
    ].join("\n");

    expect(splitMarkdownSections(source, opts)).toEqual([source]);
  });

  it("merges a section smaller than minChars into the previous section", () => {
    const source = [
      "## First",
      "A section that is long enough to stand alone.",
      "## Tiny",
      "x",
      "## Last",
      "Another section that is long enough.",
    ].join("\n");

    expect(splitMarkdownSections(source, opts)).toEqual([
      "## First\nA section that is long enough to stand alone.\n## Tiny\nx",
      "## Last\nAnother section that is long enough.",
    ]);
  });

  it("merges a small leading intro into the following section", () => {
    const source = [
      "intro",
      "## First",
      "A section that is long enough to stand alone.",
    ].join("\n");

    expect(splitMarkdownSections(source, opts)).toEqual([source]);
  });

  it("caps the section count at maxSections", () => {
    const sections = Array.from(
      { length: 9 },
      (_, i) => `## Section ${i}\nBody text for section number ${i}.`,
    );

    const result = splitMarkdownSections(sections.join("\n"), opts);

    expect(result.length).toBe(6);
    // Every line of the source survives the merges.
    expect(result.join("\n")).toBe(sections.join("\n"));
  });

  it("drops whitespace-only sections and trims the rest", () => {
    expect(splitMarkdownSections("   \n\n", opts)).toEqual([]);
  });
});
