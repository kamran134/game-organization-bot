import fs from 'fs';
import path from 'path';

/**
 * Versioned URLs for the built client.
 *
 * `no-cache` only tells a browser to revalidate copies it fetches from now on; copies it already
 * holds keep their original lifetime, and Telegram's in-app webview has no "clear cache" a user
 * can reach — clearing Telegram's cache drops downloaded media, not the webview's HTTP store. The
 * only way to retire those copies is to stop asking for the same URL, so every build serves its
 * client under its own prefix: `/b/<version>/js/app.js`. The shell is never cached, so it always
 * points at the current prefix, and the relative imports inside the bundle inherit it for free.
 */

/** Long-lived: a versioned URL names one immutable build. */
export const VERSIONED_ASSET_MAX_AGE_SECONDS = 31536000;

/**
 * Build id taken from the client entry point's mtime: it changes exactly when the client is
 * rebuilt and stays put across restarts of the same image. Falls back to `dev` when the built
 * client is missing (a server started before `npm run build:client`).
 */
export function buildAssetVersion(publicDir: string): string {
  try {
    return Math.floor(fs.statSync(path.join(publicDir, 'js', 'app.js')).mtimeMs).toString(36);
  } catch {
    return 'dev';
  }
}

/**
 * Points the shell's own script and stylesheet at the versioned prefix. Absolute URLs (the
 * Telegram SDK) and images are left alone: image URLs are also built at runtime inside the
 * client, so they stay on the plain path and keep their own caching policy.
 */
export function versionShell(html: string, version: string): string {
  return html.replace(/(href|src)="\/(js|styles)\//g, `$1="/b/${version}/$2/`);
}
