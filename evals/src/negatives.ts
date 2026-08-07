import type { EvalQuestion } from "./quiz-shape";

export interface Negative {
  fixtureId: string;
  /** The verdict field the judge must set to false. */
  mustFail: "answerable" | "singleDefensibleAnswer";
  note: string;
  question: EvalQuestion;
}

/**
 * Hand-written bad questions the judge must catch. If the judge passes
 * any of them, the judge fails calibration, not the generator.
 */
export const negatives: Negative[] = [
  {
    fixtureId: "langgraphjs",
    mustFail: "answerable",
    note: "hallucinated fact: the README names no default checkpointer",
    question: {
      text: "Which checkpointer does LangGraph use by default?",
      type: "single",
      options: [
        { text: "PostgresSaver", isCorrect: true },
        { text: "MemorySaver", isCorrect: false },
        { text: "RedisSaver", isCorrect: false },
        { text: "SqliteSaver", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "langgraphjs",
    mustFail: "singleDefensibleAnswer",
    note: "two defensible answers: the README lists both as core features",
    question: {
      text: "Which capability does the LangGraph README present as a reason to use LangGraph?",
      type: "single",
      options: [
        { text: "Durable execution", isCorrect: true },
        { text: "Human-in-the-loop", isCorrect: false },
        { text: "Automatic prompt optimization", isCorrect: false },
        { text: "Built-in vector storage", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "langgraphjs",
    mustFail: "answerable",
    note: "general knowledge: the README never mentions the npm registry launch year",
    question: {
      text: "In which year did the npm registry launch?",
      type: "single",
      options: [
        { text: "2010", isCorrect: true },
        { text: "2014", isCorrect: false },
        { text: "2016", isCorrect: false },
        { text: "2008", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "pipecat",
    mustFail: "answerable",
    note: "hallucinated fact: the README names no default transport",
    question: {
      text: "Which transport does Pipecat select by default for a new pipeline?",
      type: "single",
      options: [
        { text: "WebRTC", isCorrect: true },
        { text: "WebSockets", isCorrect: false },
        { text: "HTTP long polling", isCorrect: false },
        { text: "gRPC streams", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "pipecat",
    mustFail: "singleDefensibleAnswer",
    note: "two defensible answers: the README lists both under what you can build",
    question: {
      text: "Which kind of application does the Pipecat README say you can build?",
      type: "single",
      options: [
        { text: "Voice assistants", isCorrect: true },
        { text: "AI companions", isCorrect: false },
        { text: "Photo editors", isCorrect: false },
        { text: "Spreadsheet plugins", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "pipecat",
    mustFail: "answerable",
    note: "general knowledge: Python facts, not in the README",
    question: {
      text: "Which company employed the original creator of the Python language?",
      type: "single",
      options: [
        { text: "Google", isCorrect: true },
        { text: "Microsoft", isCorrect: false },
        { text: "Dropbox", isCorrect: false },
        { text: "IBM", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "left-pad",
    mustFail: "answerable",
    note: "hallucinated fact: the README documents no maximum length",
    question: {
      text: "What is the maximum pad length that left-pad supports?",
      type: "single",
      options: [
        { text: "1024 characters", isCorrect: true },
        { text: "255 characters", isCorrect: false },
        { text: "80 characters", isCorrect: false },
        { text: "No limit", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "left-pad",
    mustFail: "singleDefensibleAnswer",
    note: "two defensible answers: the README shows both calls returning padded numbers",
    question: {
      text: "Per the README examples, which call returns a zero-padded result?",
      type: "single",
      options: [
        { text: "leftPad(1, 2, '0')", isCorrect: true },
        { text: "leftPad(17, 5, 0)", isCorrect: false },
        { text: "leftPad('foo', 5)", isCorrect: false },
        { text: "leftPad('foobar', 6)", isCorrect: false },
      ],
    },
  },
  {
    fixtureId: "left-pad",
    mustFail: "answerable",
    note: "general knowledge: the 2016 unpublish incident is not in the README",
    question: {
      text: "In which year did the left-pad unpublish incident break npm builds?",
      type: "single",
      options: [
        { text: "2016", isCorrect: true },
        { text: "2014", isCorrect: false },
        { text: "2018", isCorrect: false },
        { text: "2020", isCorrect: false },
      ],
    },
  },
];
