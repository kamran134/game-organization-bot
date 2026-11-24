/**
 * Cache policy for the web app's static files.
 *
 * The client is an ES-module tree: `js/app.js` pulls `js/pages/*.js` in by relative path, so a
 * version query on the entry point would never reach them — the only way to keep a client from
 * pinning an old build is to make it revalidate. Markup, scripts and styles are therefore served
 * `no-cache`, which still answers an unchanged file with a cheap 304 through the ETag. Without it
 * Telegram's in-app webview happily keeps serving a stale bundle for days after a deploy.
 *
 * Images and fonts keep a day of caching: the Mafia card art is heavy and rarely changes, and a
 * card that does get replaced under the same name is a day stale at worst.
 */

const CACHEABLE_ASSET = /\.(webp|png|jpe?g|gif|svg|ico|woff2?|ttf)$/i;

/** One day — long enough to spare the traffic, short enough for replaced artwork to catch up. */
export const ASSET_MAX_AGE_SECONDS = 86400;

/** The `Cache-Control` value for a static file, chosen by its extension. */
export function staticCacheControl(filePath: string): string {
  return CACHEABLE_ASSET.test(filePath)
    ? `public, max-age=${ASSET_MAX_AGE_SECONDS}`
    : 'no-cache';
}
