/** True when Telegram rejected an edit because text and markup are identical to the current message. */
export function isMessageNotModified(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { description, message } = error as { description?: unknown; message?: unknown };
  return [description, message].some(
    (value) => typeof value === 'string' && value.includes('message is not modified'),
  );
}
