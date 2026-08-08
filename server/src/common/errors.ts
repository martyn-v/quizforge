export abstract class AgentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidAnswerError extends AgentError {}

export class InvalidStateError extends AgentError {}

/** The source document could not be read. */
export class FetchSourceError extends AgentError {}

/** The questions could not be generated */
export class GenerateQuestionsError extends AgentError {}

/** There was an error persisting the quiz */
export class PersistQuizError extends AgentError {}
