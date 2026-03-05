/**
 * API layer — wraps fetch with Telegram auth header.
 * Call setInitData() once at startup with tg.initData.
 */

let _initData = '';

/**
 * Store the Telegram initData string to be sent with every request.
 */
export function setInitData(initData: string): void {
  _initData = initData;
}

/**
 * Authenticated fetch wrapper.
 * Throws an Error with the server's error message on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': _initData,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? 'Request failed');
  }

  return res.json() as Promise<T>;
}
