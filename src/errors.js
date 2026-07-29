export class UserError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = "UserError";
    this.exitCode = exitCode;
  }
}

export class ProviderError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = "ProviderError";
    this.details = details;
  }
}
