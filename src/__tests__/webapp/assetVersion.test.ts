import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetVersion, versionShell } from '../../webapp/assetVersion';

const SHELL = `<link rel="stylesheet" href="/styles/main.css" />
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<img src="/img/mafia/don-3.webp">
<script type="module" src="/js/app.js"></script>`;

describe('versionShell', () => {
  it('moves the script and the stylesheet onto the versioned prefix', () => {
    const html = versionShell(SHELL, 'abc123');
    assert.match(html, /src="\/b\/abc123\/js\/app\.js"/);
    assert.match(html, /href="\/b\/abc123\/styles\/main\.css"/);
  });

  it('leaves absolute URLs and images alone', () => {
    const html = versionShell(SHELL, 'abc123');
    assert.match(html, /src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"/);
    assert.match(html, /src="\/img\/mafia\/don-3\.webp"/);
  });
});

describe('buildAssetVersion', () => {
  it('falls back to dev when the client was not built', () => {
    assert.equal(buildAssetVersion('/no/such/place'), 'dev');
  });

  it('is stable for the same build and url-safe', () => {
    const version = buildAssetVersion(process.cwd() + '/public');
    assert.equal(version, buildAssetVersion(process.cwd() + '/public'));
    assert.match(version, /^[a-z0-9]+$/);
  });
});
