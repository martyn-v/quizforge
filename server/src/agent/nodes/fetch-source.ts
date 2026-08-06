import { GraphNode } from "@langchain/langgraph";
import { FetchSourceError } from "../../common/errors";
import type { QuizState } from "../state";

const GITHUB_HOSTS = ["github.com", "raw.githubusercontent.com"];

// The dot is escaped so it matches only a dot, and the pattern is anchored so
// it matches only a whole URL. Without either, a lookalike host and a blob URL
// carried as a query parameter are both rewritten.
const GITHUB_BLOB_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/;

/**
 * Rejects a source URL that is not a Markdown file on GitHub.
 *
 * The server makes the request, so an unrestricted URL lets a user reach an
 * address that only the server can reach. The check compares the parsed
 * hostname, because a check on the start of the string accepts
 * `raw.githubusercontent.com.attacker.example`.
 *
 * The path decides whether the file is Markdown. raw.githubusercontent.com
 * serves a Markdown file as text/plain, so the content type cannot.
 */
export function assertGithubMarkdownUrl(url: string): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new FetchSourceError(`Not a url: ${url}`, { cause });
  }

  if (parsed.protocol !== "https:" || !GITHUB_HOSTS.includes(parsed.hostname)) {
    throw new FetchSourceError(
      `Refusing ${url}. The source must be an https url on ${GITHUB_HOSTS.join(" or ")}`,
    );
  }

  if (!parsed.pathname.toLowerCase().endsWith(".md")) {
    throw new FetchSourceError(`${url} is not a .md file`);
  }
}

/**
 * Converts a GitHub blob URL to its raw.githubusercontent.com form. A URL
 * that is not a GitHub blob URL is returned unchanged.
 *
 * A blob URL returns an HTML page. The raw URL returns the file itself.
 */
export function toRawGithubUrl(url: string): string {
  return url.replace(
    GITHUB_BLOB_URL,
    "https://raw.githubusercontent.com/$1/$2/$3",
  );
}

/**
 * The largest document the agent accepts, in characters.
 *
 * The document goes into graph state, and LangGraph writes that state to a
 * checkpoint on every step, so an oversized document is paid for repeatedly.
 * A README is normally far below this.
 */
export const MAX_SOURCE_CHARS = 200_000;

/**
 * Removes the parts of a README that carry no meaning for a quiz: badges,
 * inline HTML, and the target of every link.
 *
 * Fenced code blocks are left as they are. A quiz about a library asks about
 * its examples, and the patterns below would corrupt them.
 */
export function cleanMarkdown(markdown: string): string {
  // A capturing split puts the fenced blocks at the odd indexes.
  return markdown
    .split(/(```[\s\S]*?```)/)
    .map((part, index) => (index % 2 === 1 ? part : cleanProse(part)))
    .join("")
    .trim();
}

function cleanProse(text: string): string {
  return text
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "") // badge, an image link
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // image
    .replace(/<[^>]+>/g, "") // html tag
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // link, keeping its text
    .replace(/\n{3,}/g, "\n\n");
}

export async function fetchGithubReadme(url: string): Promise<string> {
  let response: Response;

  try {
    // The permitted host can still answer with a redirect to a host that is
    // not permitted. "error" makes a redirect a failure, not a second request.
    response = await fetch(url, { redirect: "error" });
  } catch (cause) {
    throw new FetchSourceError(`Failed to fetch ${url}`, { cause });
  }

  if (!response.ok) {
    throw new FetchSourceError(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();

  if (text.length > MAX_SOURCE_CHARS) {
    throw new FetchSourceError(
      `${url} is ${text.length} characters. The limit is ${MAX_SOURCE_CHARS}`,
    );
  }

  return text;
}

export function makeFetchSourceNode(): GraphNode<typeof QuizState> {
  return async (state) => {
    // Validate before converting, so the error names the url the user typed.
    // TODO: error handling: the node should not throw, but return a state with an error message.
    assertGithubMarkdownUrl(state.readme_url);

    const readme_url = toRawGithubUrl(state.readme_url);
    const source = cleanMarkdown(await fetchGithubReadme(readme_url));

    return { readme_url, source };
  };
}
