const MAX_TRUST = 100;
const MIN_TRUST = 0;
const BASELINE_TRUST = 90;
const HOUR = 60 * 60 * 1000;

const REASON_MAP = Object.freeze({
  SIM_REPLACEMENT: {
    code: 'RECENT_SIM_REPLACEMENT',
    message: 'SIM replacement occurred recently',
    impact: -30,
  },
  DEVICE_CHANGED: {
    code: 'DEVICE_CHANGED',
    message: 'Current device differs from the trusted installation',
    impact: -25,
  },
  NEW_RECIPIENT: {
    code: 'NEW_RECIPIENT',
    message: 'Recipient has not previously been used',
    impact: -10,
  },
  LARGE_TRANSACTION: {
    code: 'LARGE_TRANSACTION',
    message: 'Transaction amount exceeds the configured large-transaction threshold',
    impact: -15,
  },
  SECURITY_CHANGE: {
    code: 'SECURITY_CHANGE',
    message: 'Security configuration changed recently',
    impact: -20,
  },
  LOCATION_ANOMALY: {
    code: 'LOCATION_ANOMALY',
    message: 'Current location differs from the trusted location by a significant distance',
    impact: -15,
  },
  LOCATION_UPDATE: {
    code: 'LOCATION_UPDATE',
    message: 'Location changed beyond the expected baseline',
    impact: -15,
  },
  DEVICE_REGISTERED: {
    code: 'DEVICE_REGISTERED',
    message: 'Device successfully registered to the user',
    impact: 10,
  },
  TEST_EVENT: {
    code: 'TEST_EVENT',
    message: 'Test event recorded for identity monitoring',
    impact: 0,
  },
  TRANSACTION_ATTEMPT: {
    code: 'TRANSACTION_ATTEMPT',
    message: 'Transaction attempt evaluated without a high-risk trust event',
    impact: 0,
  },
});

const RISK_DELTAS = Object.freeze({
  SIM_REPLACEMENT: -30,
  DEVICE_CHANGED: -25,
  NEW_RECIPIENT: -10,
  LARGE_TRANSACTION: -15,
  SECURITY_CHANGE: -20,
  DEVICE_REGISTERED: 10,
  TEST_EVENT: 0,
  TRANSACTION_ATTEMPT: 0,
  LOCATION_ANOMALY: -15,
  LOCATION_UPDATE: -15,
});

function getRiskDelta(type, metadata = {}) {
  if (type === 'LOCATION_UPDATE') return metadata.newArea === true ? -15 : 0;
  if (type === 'LOCATION_VERIFIED') {
    const distanceKm = Number(metadata.distanceKm ?? 0);
    return Number.isFinite(distanceKm) && distanceKm >= 50 ? -15 : 0;
  }
  if (type === 'LOCATION_ANOMALY') return -15;
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

function buildReasons(type, metadata = []) {
  const base = REASON_MAP[type];
  if (!base) return [];

  const reasons = [{
    code: base.code,
    message: base.message,
    impact: base.impact,
  }];

  if (type === 'LOCATION_ANOMALY' && Number.isFinite(Number(metadata.distanceKm))) {
    reasons[0].message = `Location differs from the trusted baseline by ${Number(metadata.distanceKm).toFixed(1)} km`;
  }

  if (type === 'LOCATION_VERIFIED' && Number.isFinite(Number(metadata.distanceKm))) {
    reasons[0].message = `Location check completed with a distance of ${Number(metadata.distanceKm).toFixed(1)} km from the trusted baseline`;
  }

  return reasons;
}

function decideEvent({ type, metadata, events, timestamp, now }) {
  const riskDelta = getRiskDelta(type, metadata);
  const resultingTrust = calculateTrustScore([...events, { riskDelta, timestamp }], now);
  const reasons = buildReasons(type, metadata);

  return {
    trustScore: resultingTrust,
    riskDelta,
    action: actionForScore(resultingTrust),
    reasons,
  };
}

module.exports = {
  BASELINE_TRUST,
  REASON_MAP,
  actionForScore,
  buildReasons,
  calculateTrustScore,
  decideEvent,
  getRiskDelta,
  recencyWeight,
};
