const MAX_TRUST = 100;
const MIN_TRUST = 0;
const BASELINE_TRUST = 90;
const HOUR = 60 * 60 * 1000;

const RISK_DELTAS = Object.freeze({
  SIM_REPLACEMENT: -30,
  DEVICE_CHANGED: -25,
  NEW_RECIPIENT: -10,
  LARGE_TRANSACTION: -15,
  SECURITY_CHANGE: -20,
  DEVICE_REGISTERED: 10,
  TEST_EVENT: 0,
  TRANSACTION_ATTEMPT: 0,
});

function getRiskDelta(type, metadata = {}) {
  if (type === 'LOCATION_UPDATE') return metadata.newArea === true ? -15 : 0;
  return RISK_DELTAS[type] ?? 0;
}

function recencyWeight(timestamp, now = Date.now()) {
  const age = Math.max(0, now - new Date(timestamp).getTime());
  if (age < HOUR) return 1;
  if (age < 24 * HOUR) return 0.7;
  if (age < 72 * HOUR) return 0.3;
  return 0;
}

function calculateTrustScore(events, now = Date.now()) {
  const score = events.reduce((total, event) => {
    return total + event.riskDelta * recencyWeight(event.timestamp, now);
  }, BASELINE_TRUST);
  return Math.max(MIN_TRUST, Math.min(MAX_TRUST, Math.round(score)));
}

function actionForScore(trustScore) {
  if (trustScore >= 70) return 'ALLOW';
  if (trustScore >= 40) return 'STEP_UP';
  return 'BLOCK';
}

function decideEvent({ type, metadata, events, timestamp, now }) {
  const riskDelta = getRiskDelta(type, metadata);
  const resultingTrust = calculateTrustScore([...events, { riskDelta, timestamp }], now);
  return {
    trustScore: resultingTrust,
    riskDelta,
    action: actionForScore(resultingTrust),
  };
}

module.exports = {
  BASELINE_TRUST,
  actionForScore,
  calculateTrustScore,
  decideEvent,
  getRiskDelta,
  recencyWeight,
};
