/**
 * DOM helpers and Telegram button lifecycle management.
 *
 * tg.BackButton.onClick / tg.MainButton.onClick are additive — every call
 * registers a new handler on top of old ones.  The helpers below track the
 * current callback and call offClick prior to registering the next one.
 */

import type { WebApp } from 'telegram-web-app';

/** Alias for the Telegram WebApp instance type — used across all pages. */
export type TelegramWebApp = WebApp;

let _backHandler: (() => void) | null = null;
let _mainHandler: (() => void) | null = null;

// ─── Content helpers ─────────────────────────────────────────────────────────

/** Hides the loader and renders HTML into the content area. */
export function show(html: string): void {
  (document.getElementById('loader') as HTMLElement).classList.add('hidden');
  const content = document.getElementById('content') as HTMLElement;
  content.classList.remove('hidden');
  content.innerHTML = html;
}

/** Shows the full-screen loader and hides content. */
export function showLoader(): void {
  (document.getElementById('loader') as HTMLElement).classList.remove('hidden');
  (document.getElementById('content') as HTMLElement).classList.add('hidden');
}

/**
 * Displays a temporary toast notification.
 * @param msg    Message to display.
 * @param isError  When true, uses error styling.
 */
export function toast(msg: string, isError = false): void {
  const el = document.getElementById('toast') as HTMLElement;
  el.textContent = msg;
  el.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ─── Telegram BackButton ──────────────────────────────────────────────────────

/**
 * Shows the Telegram BackButton and registers a handler,
 * automatically removing any previously registered handler first.
 */
export function setBackButton(tg: WebApp, fn: () => void): void {
  if (_backHandler) tg.BackButton.offClick(_backHandler);
  _backHandler = fn;
  tg.BackButton.onClick(_backHandler);
  tg.BackButton.show();
}

/**
 * Hides the Telegram BackButton and removes its handler.
 */
export function hideBackButton(tg: WebApp): void {
  if (_backHandler) tg.BackButton.offClick(_backHandler);
  _backHandler = null;
  tg.BackButton.hide();
}

// ─── Telegram MainButton ──────────────────────────────────────────────────────

/**
 * Shows the Telegram MainButton, sets its label and handler,
 * automatically removing any previously registered handler first.
 */
export function setMainButton(tg: WebApp, text: string, fn: () => void): void {
  if (_mainHandler) tg.MainButton.offClick(_mainHandler);
  _mainHandler = fn;
  tg.MainButton.setText(text);
  tg.MainButton.onClick(_mainHandler);
  tg.MainButton.show();
}

/**
 * Hides the Telegram MainButton and removes its handler.
 */
export function hideMainButton(tg: WebApp): void {
  if (_mainHandler) tg.MainButton.offClick(_mainHandler);
  _mainHandler = null;
  tg.MainButton.hide();
}
