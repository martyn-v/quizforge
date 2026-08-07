import { CommandInstance } from "@langchain/langgraph";
import { FetchSourceError } from "../../common/errors";
import {
  assertGithubMarkdownUrl,
  cleanMarkdown,
  fetchGithubReadme,
  makeFetchSourceNode,
  MAX_SOURCE_CHARS,
  toRawGithubUrl,
} from "./fetch-source";

function stubFetch(response: Response | Error) {
  const fetchMock = vi
    .fn()
    .mockImplementation(() =>
      response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response),
    );

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assertGithubMarkdownUrl", () => {
  it.each([
    "https://github.com/pipecat-ai/pipecat/blob/main/README.md",
    "https://raw.githubusercontent.com/owner/repo/main/README.md",
  ])("accepts %s", (url) => {
    expect(() => {
      assertGithubMarkdownUrl(url);
    }).not.toThrow();
  });

  it.each([
    { label: "another host", url: "https://example.com/README.md" },
    { label: "an internal address", url: "http://169.254.169.254/" },
    // A check on the start of the string accepts this. Only a parsed
    // hostname comparison rejects it.
    {
      label: "a lookalike host",
      url: "https://raw.githubusercontent.com.attacker.example/o/r/main/README.md",
    },
    { label: "a file that is not markdown", url: "https://github.com/o/r/blob/main/a.txt" },
    { label: "a url that cannot be parsed", url: "not a url" },
  ])("refuses $label", ({ url }) => {
    expect(() => {
      assertGithubMarkdownUrl(url);
    }).toThrow(FetchSourceError);
  });
});

describe("toRawGithubUrl", () => {
  it("converts a blob url to its raw form", () => {
    expect(
      toRawGithubUrl(
        "https://github.com/pipecat-ai/pipecat/blob/main/README.md",
      ),
    ).toBe(
      "https://raw.githubusercontent.com/pipecat-ai/pipecat/main/README.md",
    );
  });

  it("leaves a url that is already raw unchanged", () => {
    const url = "https://raw.githubusercontent.com/owner/repo/main/README.md";

    expect(toRawGithubUrl(url)).toBe(url);
  });
});

describe("fetchGithubReadme", () => {
  const url = "https://raw.githubusercontent.com/owner/repo/main/README.md";

  it("returns the body of a successful response", async () => {
    stubFetch(new Response("# Pipecat"));

    await expect(fetchGithubReadme(url)).resolves.toBe("# Pipecat");
  });

  it("throws rather than returning the body of a failed response", async () => {
    // A 404 page is HTML. Returning it would send an error page to the model
    // as though it were the document.
    stubFetch(new Response("<html>Not Found</html>", { status: 404 }));

    await expect(fetchGithubReadme(url)).rejects.toThrow(FetchSourceError);
  });

  it("throws when the request fails", async () => {
    stubFetch(new TypeError("fetch failed"));

    await expect(fetchGithubReadme(url)).rejects.toThrow(FetchSourceError);
  });

  // The whole document goes into graph state, and LangGraph writes that
  // state to a checkpoint on every step. An oversized document is therefore
  // paid for repeatedly, not once.
  it("refuses a document larger than the limit", async () => {
    stubFetch(new Response("x".repeat(MAX_SOURCE_CHARS + 1)));

    await expect(fetchGithubReadme(url)).rejects.toThrow(FetchSourceError);
  });

  it("accepts a document at the limit", async () => {
    stubFetch(new Response("x".repeat(MAX_SOURCE_CHARS)));

    await expect(fetchGithubReadme(url)).resolves.toHaveLength(
      MAX_SOURCE_CHARS,
    );
  });

  // The permitted host can still redirect elsewhere.
  it("does not follow redirects", async () => {
    const fetchMock = stubFetch(new Response("body"));

    await fetchGithubReadme(url);

    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ redirect: "error" }),
    );
  });
});

describe("cleanMarkdown", () => {
  it("removes badges", () => {
    const readme =
      "# Title\n\n[![Build](https://img.shields.io/x.svg)](https://ci.example)\n\nText.";

    expect(cleanMarkdown(readme)).toBe("# Title\n\nText.");
  });

  it("removes html", () => {
    expect(cleanMarkdown('<p align="center">Hello</p>')).toBe("Hello");
  });

  it("keeps the text of a link and drops the url", () => {
    expect(cleanMarkdown("See the [docs](https://example.com/docs).")).toBe(
      "See the docs.",
    );
  });

  // A quiz about a library asks about its examples, so the cleaning must not
  // reach inside a fenced block. The html and link patterns would corrupt it.
  it("leaves a fenced code block untouched", () => {
    const readme = "Use it:\n\n```html\n<div id=\"app\"></div>\n```\n";

    expect(cleanMarkdown(readme)).toContain('<div id="app"></div>');
  });

  it("collapses runs of blank lines", () => {
    expect(cleanMarkdown("a\n\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("fetchSourceNode", () => {
  const blobUrl = "https://github.com/pipecat-ai/pipecat/blob/main/README.md";
  const rawUrl =
    "https://raw.githubusercontent.com/pipecat-ai/pipecat/main/README.md";

  it("converts the url, fetches it, and stores both", async () => {
    const fetchMock = stubFetch(new Response("# Pipecat"));

    const result = await makeFetchSourceNode()(
      {
        readme_url: blobUrl,
        source: "",
        quiz: undefined,
        quizId: undefined,
        answers: [],
      },
      {} as never,
    );

    assert.notInstanceOf(result, CommandInstance);

    expect(result.readme_url).toBe(rawUrl);
    expect(result.source).toBe("# Pipecat");
    // The raw url is requested, not the blob url that returns an HTML page.
    expect(fetchMock).toHaveBeenCalledWith(rawUrl, expect.anything());
  });

  it("rejects a bad url without fetching", async () => {
    const fetchMock = stubFetch(new Response("body"));

    await expect(
      makeFetchSourceNode()(
        {
          readme_url: "https://example.com/README.md",
          source: "",
          quiz: undefined,
          quizId: undefined,
          answers: [],
        },
        {} as never,
      ),
    ).rejects.toThrow(FetchSourceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
