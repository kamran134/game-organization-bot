/**
 * Thrown when a service rejects input that came from a user.
 *
 * Lets routes tell "the user typed something invalid" (safe to echo back, 400)
 * apart from "something broke" (must be logged, generic 500) instead of
 * collapsing both into one response and leaking internal messages.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when a request is well-formed but conflicts with the current state
 * (wrong status, already joined, not enough participants). Routes map it to 409.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
