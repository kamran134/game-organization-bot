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
