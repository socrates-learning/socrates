import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createServerTimingRecorder,
  formatServerTiming,
  PROXY_AUTH_TIMING_HEADER,
  PROXY_ROLE_TIMING_HEADER,
  PROXY_TOTAL_TIMING_HEADER,
  readProxyTiming,
} from '../lib/request-performance.ts';

test('Server-Timing output contains only sanitized names and rounded durations', () => {
  assert.equal(
    formatServerTiming([
      { name: 'proxy auth', durationMs: 12.34 },
      { name: 'role;secret', durationMs: 4.56 },
    ]),
    'proxy_auth;dur=12.3, role_secret;dur=4.6'
  );
});

test('proxy timing headers are parsed without carrying request data', () => {
  const values = new Map([
    [PROXY_AUTH_TIMING_HEADER, '18.27'],
    [PROXY_ROLE_TIMING_HEADER, '31.04'],
    [PROXY_TOTAL_TIMING_HEADER, '52.88'],
  ]);

  assert.deepEqual(readProxyTiming({ get: (name) => values.get(name) ?? null }), [
    { name: 'proxy_auth', durationMs: 18.3 },
    { name: 'proxy_role', durationMs: 31 },
    { name: 'proxy_total', durationMs: 52.9 },
  ]);
});

test('invalid timing values are omitted', () => {
  const values = new Map([
    [PROXY_AUTH_TIMING_HEADER, '-1'],
    [PROXY_ROLE_TIMING_HEADER, 'not-a-number'],
  ]);

  assert.deepEqual(readProxyTiming({ get: (name) => values.get(name) ?? null }), []);
});

test('structured timing logs distinguish application time and request total', () => {
  const messages = [];
  const originalInfo = console.info;
  console.info = (message) => messages.push(message);

  try {
    const timing = createServerTimingRecorder({
      requestId: 'timing-test-request',
      route: '/',
    });
    timing.record('home_data', 12.34);
    timing.log([{ name: 'proxy_total', durationMs: 25 }]);
  } finally {
    console.info = originalInfo;
  }

  assert.equal(messages.length, 1);
  const payload = JSON.parse(messages[0]);
  assert.equal(payload.event, 'socrates_server_timing');
  assert.equal(payload.requestId, 'timing-test-request');
  assert.equal(payload.route, '/');
  assert.ok(payload.stages.some((entry) => entry.name === 'application_total'));
  assert.ok(payload.totalMs >= 25);
});
