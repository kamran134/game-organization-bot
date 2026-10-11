import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

/**
 * runMigrations.ts lists migration classes by hand. A new migration file that is not
 * added there is silently never run on prod — this test catches that.
 * The runner is read as text: importing it would execute the migration script.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');
const RUNNER = path.resolve(__dirname, '../../database/runMigrations.ts');

describe('migrations registry', () => {
  test('every timestamped migration file is registered in runMigrations.ts', () => {
    const runner = fs.readFileSync(RUNNER, 'utf8');
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{13}-.+\.ts$/.test(f));
    assert.ok(files.length > 0);

    for (const file of files) {
      const source = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const match = source.match(/export class (\w+)/);
      assert.ok(match, `${file}: no exported migration class`);
      const className = match[1];
      const timestamp = file.slice(0, 13);
      assert.ok(className.endsWith(timestamp), `${file}: class ${className} must end with ${timestamp}`);
      assert.ok(
        new RegExp(`migrations:\\s*\\[[^\\]]*\\b${className}\\b`).test(runner),
        `${file}: ${className} is not in the migrations array of runMigrations.ts`,
      );
    }
  });
});
