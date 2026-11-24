import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_MAX_AGE_SECONDS, staticCacheControl } from '../../webapp/staticCache';

describe('staticCacheControl', () => {
  it('makes the shell, the scripts and the styles revalidate', () => {
    for (const file of ['/public/index.html', '/public/js/app.js', '/public/js/pages/home.js', '/public/styles/main.css']) {
      assert.equal(staticCacheControl(file), 'no-cache', file);
    }
  });

  it('lets images and fonts be cached for a day', () => {
    const expected = `public, max-age=${ASSET_MAX_AGE_SECONDS}`;
    for (const file of ['/public/img/mafia/don-3.webp', '/public/img/logo.PNG', '/public/img/icon.svg', '/public/fonts/x.woff2']) {
      assert.equal(staticCacheControl(file), expected, file);
    }
  });

  it('falls back to revalidation for anything it does not know', () => {
    assert.equal(staticCacheControl('/public/data/deck.json'), 'no-cache');
    assert.equal(staticCacheControl('/public/js/app.js.map'), 'no-cache');
    assert.equal(staticCacheControl('/public/webp'), 'no-cache');
  });
});
