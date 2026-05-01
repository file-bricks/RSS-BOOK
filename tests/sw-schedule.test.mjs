import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

afterEach(() => {
  delete globalThis.chrome;
});

function installChromeMock() {
  const addListener = () => {};

  globalThis.chrome = {
    runtime: {
      onInstalled: { addListener },
      onStartup: { addListener },
      onMessage: { addListener }
    },
    alarms: {
      onAlarm: { addListener },
      async get() {
        return null;
      },
      async clear() {},
      async create() {}
    },
    storage: {
      onChanged: { addListener },
      local: {
        async get() {
          return { settings: {}, feeds: {} };
        },
        async set() {}
      }
    }
  };
}

test("alarm scheduling skips manual-only feeds when global interval is disabled", async () => {
  installChromeMock();
  const { shouldUpdateFeedForReason } = await import(`../sw.js?sw-schedule=${Date.now()}`);
  const now = Date.parse("2026-05-01T12:00:00Z");

  assert.equal(
    shouldUpdateFeedForReason(
      { intervalMinutes: 0, lastFetch: 0 },
      "alarm",
      { globalIntervalMinutes: 0 },
      now
    ),
    false
  );
  assert.equal(
    shouldUpdateFeedForReason(
      { intervalMinutes: 0, lastFetch: 0 },
      "alarm",
      { globalIntervalMinutes: 15 },
      now
    ),
    true
  );
  assert.equal(
    shouldUpdateFeedForReason(
      { intervalMinutes: 30, lastFetch: now - 29 * 60_000 },
      "alarm",
      { globalIntervalMinutes: 0 },
      now
    ),
    false
  );
  assert.equal(
    shouldUpdateFeedForReason(
      { intervalMinutes: 30, lastFetch: now - 31 * 60_000 },
      "alarm",
      { globalIntervalMinutes: 0 },
      now
    ),
    true
  );
  assert.equal(
    shouldUpdateFeedForReason(
      { intervalMinutes: 0, lastFetch: 0 },
      "manual",
      { globalIntervalMinutes: 0 },
      now
    ),
    true
  );
});
