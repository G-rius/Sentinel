const assert = require('node:assert/strict');
const { test } = require('node:test');
const { decideEvent } = require('../src/services/trustEngine');

test('location anomalies and explainable reasons are included in the trust decision', () => {
  const decision = decideEvent({
    type: 'LOCATION_ANOMALY',
    metadata: { distanceKm: 42.3, accuracy: 180 },
    events: [{ riskDelta: 0, timestamp: new Date(Date.now() - 1000).toISOString() }],
    timestamp: new Date().toISOString(),
  });

  assert.equal(decision.riskDelta, -15);
  assert.equal(decision.action, 'ALLOW');
  assert.ok(decision.reasons.some((reason) => reason.code === 'LOCATION_ANOMALY'));
  assert.ok(decision.reasons.some((reason) => reason.message.toLowerCase().includes('location')));
});

test('new recipient risk contributes a clear reason code', () => {
  const decision = decideEvent({
    type: 'NEW_RECIPIENT',
    metadata: { recipient: '0712345678' },
    events: [{ riskDelta: 0, timestamp: new Date(Date.now() - 1000).toISOString() }],
    timestamp: new Date().toISOString(),
  });

  assert.equal(decision.riskDelta, -10);
  assert.ok(decision.reasons.some((reason) => reason.code === 'NEW_RECIPIENT'));
});
