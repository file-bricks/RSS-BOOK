import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(__dirname, '../manifest.json'), 'utf8'));

test('manifest has browser_specific_settings.gecko.id for AMO submission', () => {
  assert.ok(manifest.browser_specific_settings, 'browser_specific_settings must be present');
  assert.ok(manifest.browser_specific_settings.gecko, 'gecko block must be present');
  assert.ok(manifest.browser_specific_settings.gecko.id, 'gecko.id must be set for AMO');
});

test('manifest gecko strict_min_version is at least 128', () => {
  const ver = manifest.browser_specific_settings?.gecko?.strict_min_version;
  assert.ok(ver, 'strict_min_version must be set');
  assert.ok(parseFloat(ver) >= 128, `strict_min_version ${ver} must be >= 128.0`);
});

test('manifest background uses service_worker for Chrome/Edge MV3', () => {
  assert.ok(manifest.background?.service_worker, 'service_worker must be defined for Chrome/Edge MV3');
  assert.strictEqual(manifest.background.type, 'module', 'background type must be "module"');
});

test('manifest is Manifest Version 3 (MV3)', () => {
  assert.strictEqual(manifest.manifest_version, 3, 'manifest_version must be 3');
});
