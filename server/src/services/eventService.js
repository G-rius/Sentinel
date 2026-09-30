const { EVENT_TYPE_SET } = require('../constants/eventTypes');
const { actionForScore, calculateTrustScore, decideEvent } = require('./trustEngine');

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function deviceFields(device = {}) {
  return {
    manufacturer: device.manufacturer || 'Unknown',
    model: device.model || 'Unknown',
    os: device.os || 'Unknown',
    osVersion: device.osVersion || 'Unknown',
  };
}

function createEventService({ database, broadcast = () => {} }) {
  async function processEvent(input, { publish = true } = {}) {
    if (!EVENT_TYPE_SET.has(input.type)) throw httpError('Unknown event type');
    const timestamp = new Date(input.timestamp);
    if (Number.isNaN(timestamp.getTime())) throw httpError('timestamp must be a valid ISO-8601 date');

    const result = await database.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id: input.userId } });
      if (!user) throw httpError(`User not found: ${input.userId}`, 404);

      const device = await transaction.device.upsert({
        where: { userId_installationId: { userId: user.id, installationId: input.installationId } },
        update: {
          ...deviceFields(input.device),
          ...(input.type === 'DEVICE_CHANGED' || input.type === 'SIM_REPLACEMENT' ? { trusted: false } : {}),
          ...(input.type === 'DEVICE_REGISTERED' ? { trusted: true } : {}),
        },
        create: {
          userId: user.id,
          installationId: input.installationId,
          ...deviceFields(input.device),
          trusted: input.type === 'DEVICE_REGISTERED',
        },
      });
      const history = await transaction.event.findMany({
        where: { userId: user.id },
        select: { riskDelta: true, timestamp: true },
      });
      const decision = decideEvent({
        type: input.type,
        metadata: input.metadata || {},
        events: history,
        timestamp,
      });
      const event = await transaction.event.create({
        data: {
          userId: user.id,
          deviceId: device.id,
          type: input.type,
          timestamp,
          metadata: input.metadata || {},
          riskDelta: decision.riskDelta,
          resultingTrust: decision.trustScore,
          action: decision.action,
        },
        include: { device: true },
      });
      await transaction.user.update({ where: { id: user.id }, data: { trustScore: decision.trustScore } });
      return { event, ...decision };
    });

    const response = {
      success: true,
      eventId: result.event.id,
      receivedAt: result.event.createdAt.toISOString(),
      trustScore: result.trustScore,
      action: result.action,
      riskDelta: result.riskDelta,
      latestEvent: result.event,
    };
    if (publish) {
      broadcast({ trustScore: response.trustScore, latestEvent: response.latestEvent, action: response.action });
    }
    console.log('Received event:', JSON.stringify(response.latestEvent));
    return response;
  }

  async function getTrust(userId) {
    const user = await database.user.findUnique({ where: { id: userId } });
    if (!user) throw httpError(`User not found: ${userId}`, 404);
    const events = await database.event.findMany({
      where: { userId },
      select: { riskDelta: true, timestamp: true },
    });
    const trustScore = calculateTrustScore(events);
    const updatedUser = await database.user.update({ where: { id: userId }, data: { trustScore } });
    return { userId, trustScore: updatedUser.trustScore, action: actionForScore(updatedUser.trustScore) };
  }

  async function getEvents(userId, limit = 50) {
    return database.event.findMany({
      where: { userId },
      orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(Number(limit) || 50, 1), 200),
      include: { device: true },
    });
  }

  async function simulateEvent(input) {
    const user = await database.user.findUnique({
      where: { id: input.userId || 'demo-user' },
      include: { devices: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!user) throw httpError('Demo user not found', 404);
    const device = user.devices[0];
    const simulatedDevice = input.type === 'DEVICE_CHANGED'
      ? { ...device, manufacturer: 'Sentinel Simulator', model: 'Unrecognized replacement device' }
      : device;
    return processEvent({
      type: input.type,
      userId: user.id,
      installationId: input.installationId || device?.installationId || 'demo-installation',
      device: input.device || simulatedDevice || {},
      timestamp: new Date().toISOString(),
      metadata: input.metadata || (input.type === 'LOCATION_UPDATE' ? { newArea: true } : {}),
    });
  }

  async function createTransaction(input) {
    const user = await database.user.findUnique({
      where: { id: input.userId || 'demo-user' },
      include: { devices: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!user) throw httpError('User not found', 404);
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw httpError('amount must be a positive number');
    if (typeof input.recipient !== 'string' || !input.recipient.trim()) throw httpError('recipient is required');

    const eventResult = await processEvent({
      type: amount >= 20000 ? 'LARGE_TRANSACTION' : 'TRANSACTION_ATTEMPT',
      userId: user.id,
      installationId: input.installationId || user.devices[0]?.installationId || 'demo-installation',
      device: input.device || user.devices[0] || {},
      timestamp: new Date().toISOString(),
      metadata: { amount, recipient: input.recipient.trim() },
    }, { publish: false });
    const status = eventResult.action === 'BLOCK'
      ? 'BLOCKED'
      : eventResult.action === 'STEP_UP' ? 'STEP_UP' : 'ALLOWED';
    const transaction = await database.transaction.create({
      data: { userId: user.id, amount, recipient: input.recipient.trim(), status },
    });
    broadcast({
      trustScore: eventResult.trustScore,
      latestEvent: eventResult.latestEvent,
      action: eventResult.action,
    });
    return { ...eventResult, transaction };
  }

  async function getTransactions(userId) {
    return database.transaction.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  return { createTransaction, getEvents, getTransactions, getTrust, processEvent, simulateEvent };
}

module.exports = { createEventService };
