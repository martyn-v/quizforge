export class InvalidAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAnswerError";
  }
}
