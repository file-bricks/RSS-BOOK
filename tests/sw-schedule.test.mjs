import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

afterEach(() => {
  delete globalThis.chrome;
});

function installChromeMock() {
  const addListener = () => {};
  const setCalls = [];
  const alarmCreates = [];

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
      async create(name, info) {
        alarmCreates.push({ name, info });
      }
    },
    storage: {
      onChanged: { addListener },
      local: {
        async get() {
          return { settings: {}, feeds: {}, lifecycle: {} };
        },
        async set(patch) {
          setCalls.push(patch);
        }
      }
    }
  };

  return { setCalls, alarmCreates };
}

test("alarm scheduling skips manual-only feeds when global interval is disabled", async () => {
  installChromeMock();
  const { bootPromise, computeAlarmPlan, shouldUpdateFeedForReason } = await import(`../sw.js?sw-schedule=${Date.now()}`);
  const now = Date.parse("2026-05-01T12:00:00Z");

  await bootPromise;

  assert.deepEqual(
    computeAlarmPlan(
      { globalIntervalMinutes: 0 },
      [{ intervalMinutes: 45 }, { intervalMinutes: 15 }, { intervalMinutes: 0 }]
    ),
    {
      intervalMinutes: 15,
      alarmSource: "feed",
      enabledFeedCount: 3
    }
  );

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

test("service worker boot records lifecycle info and recreates alarms", async () => {
  const { setCalls, alarmCreates } = installChromeMock();
  const { bootPromise } = await import(`../sw.js?sw-boot=${Date.now()}`);

  await bootPromise;

  assert.equal(alarmCreates.length, 0);
  assert.ok(
    setCalls.some((call) => Object.prototype.hasOwnProperty.call(call, "lifecycle")),
    "expected lifecycle storage writes during boot"
  );
});
