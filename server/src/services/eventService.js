const { EVENT_TYPE_SET } = require('../constants/eventTypes');
const { actionForScore, calculateTrustScore, decideEvent } = require('./trustEngine');
const { calculateDistanceKm } = require('./locationService');
const { resolveProviderRegistry } = require('./providerRegistry');

function httpError(message, status = 400, code = 'INVALID_REQUEST') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
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

function validateEventInput(input = {}) {
  const type = input.type;
  const userId = input.userId;
  const installationId = input.installationId;
  const timestamp = input.timestamp;
  const source = input.source || 'mobile';

  if (!EVENT_TYPE_SET.has(type)) throw httpError('Unknown event type', 400, 'INVALID_EVENT_TYPE');
  if (!userId || typeof userId !== 'string') throw httpError('userId is required', 400, 'INVALID_USER');
  if (!installationId || typeof installationId !== 'string') throw httpError('installationId is required', 400, 'INVALID_INSTALLATION');
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) throw httpError('timestamp must be a valid ISO-8601 date', 400, 'INVALID_TIMESTAMP');
  if (!['mobile', 'carrier', 'dashboard', 'system'].includes(source)) throw httpError('source must be mobile, carrier, dashboard, or system', 400, 'INVALID_SOURCE');

  const currentTime = Date.now();
  const eventTime = new Date(timestamp).getTime();
  const maxAge = Number(process.env.MAX_EVENT_AGE_MS || 5 * 60 * 1000);
  const maxFutureSkew = Number(process.env.MAX_FUTURE_SKEW_MS || 30 * 1000);
  if (currentTime - eventTime > maxAge) throw httpError('Event timestamp is too old', 400, 'OLD_EVENT');
  if (eventTime - currentTime > maxFutureSkew) throw httpError('Event timestamp is too far in the future', 400, 'FUTURE_EVENT');

  return { type, userId, installationId, timestamp, source };
}

function findDuplicateEvent(database, userId, dedupeKey) {
  if (!dedupeKey) return null;
  return database.event.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { device: true },
  }).then((event) => {
    if (!event) return null;
    const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    if (String(metadata.eventId || metadata.id || metadata.dedupeKey || '') === String(dedupeKey)) {
      return event;
    }
    return null;
  });
}

function createEventService({ database, broadcast = () => {} }) {
  async function processEvent(input, { publish = true } = {}) {
    const normalized = validateEventInput(input);
    const timestamp = new Date(normalized.timestamp);
    const dedupeKey = input.id || input.eventId || input.metadata?.eventId || input.metadata?.id || input.metadata?.dedupeKey;
    const duplicate = dedupeKey ? await findDuplicateEvent(database, normalized.userId, dedupeKey) : null;
    if (duplicate) {
      return {
        success: true,
        duplicate: true,
        eventId: duplicate.id,
        receivedAt: duplicate.createdAt.toISOString(),
        trustScore: duplicate.resultingTrust,
        action: duplicate.action,
        riskDelta: duplicate.riskDelta,
        reasons: [],
        latestEvent: duplicate,
      };
    }

    const result = await database.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id: input.userId } });
      if (!user) throw httpError(`User not found: ${input.userId}`, 404);

      const eventMetadata = {
        ...(input.metadata || {}),
        source: normalized.source,
        ...(dedupeKey ? { eventId: dedupeKey, id: dedupeKey } : {}),
      };

      const device = await transaction.device.upsert({
        where: { userId_installationId: { userId: user.id, installationId: input.installationId } },
        update: {
          ...deviceFields(input.device),
          ...(input.type === 'DEVICE_CHANGED' || input.type === 'SIM_REPLACEMENT' ? { trusted: false } : {}),
          ...(input.type === 'DEVICE_REGISTERED' ? { trusted: true } : {}),
          ...(input.type === 'LOCATION_VERIFIED' && Number.isFinite(Number(input.metadata?.latitude)) && Number.isFinite(Number(input.metadata?.longitude))
            ? {
                trustedLatitude: Number(input.metadata.latitude),
                trustedLongitude: Number(input.metadata.longitude),
              }
            : {}),
        },
        create: {
          userId: user.id,
          installationId: input.installationId,
          ...deviceFields(input.device),
          trusted: input.type === 'DEVICE_REGISTERED',
          trustedLatitude: Number.isFinite(Number(input.metadata?.latitude)) ? Number(input.metadata.latitude) : null,
          trustedLongitude: Number.isFinite(Number(input.metadata?.longitude)) ? Number(input.metadata.longitude) : null,
        },
      });
      const history = await transaction.event.findMany({
        where: { userId: user.id },
        select: { riskDelta: true, timestamp: true },
      });

      let enrichedMetadata = eventMetadata;
      if (input.type === 'LOCATION_VERIFIED' && Number.isFinite(Number(eventMetadata.latitude)) && Number.isFinite(Number(eventMetadata.longitude)) && Number.isFinite(Number(device.trustedLatitude)) && Number.isFinite(Number(device.trustedLongitude))) {
        const distanceKm = calculateDistanceKm({
          fromLatitude: Number(device.trustedLatitude),
          fromLongitude: Number(device.trustedLongitude),
          toLatitude: Number(eventMetadata.latitude),
          toLongitude: Number(eventMetadata.longitude),
        });
        enrichedMetadata = { ...eventMetadata, distanceKm };
      }

      const decision = decideEvent({
        type: input.type,
        metadata: enrichedMetadata,
        events: history,
        timestamp,
      });
      const event = await transaction.event.create({
        data: {
          userId: user.id,
          deviceId: device.id,
          type: input.type,
          timestamp,
          metadata: enrichedMetadata,
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
      duplicate: false,
      eventId: result.event.id,
      receivedAt: result.event.createdAt.toISOString(),
      trustScore: result.trustScore,
      action: result.action,
      riskDelta: result.riskDelta,
      reasons: result.reasons || [],
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
    if (!Number.isFinite(amount) || amount <= 0) throw httpError('amount must be a positive number', 400, 'INVALID_AMOUNT');
    if (typeof input.recipient !== 'string' || !input.recipient.trim()) throw httpError('recipient is required', 400, 'INVALID_RECIPIENT');
    if (!/^\+?254\d{9}$|^0\d{9}$/.test(input.recipient.trim().replace(/\s+/g, ''))) throw httpError('recipient must be a valid Kenyan phone number', 400, 'INVALID_RECIPIENT');

    const normalizedRecipient = input.recipient.trim();
    const largeTransactionThreshold = Number(process.env.LARGE_TRANSACTION_THRESHOLD || 10000);
    const eventType = amount >= largeTransactionThreshold ? 'LARGE_TRANSACTION' : 'TRANSACTION_ATTEMPT';
    const eventResult = await processEvent({
      type: eventType,
      userId: user.id,
      installationId: input.installationId || user.devices[0]?.installationId || 'demo-installation',
      device: input.device || user.devices[0] || {},
      timestamp: new Date().toISOString(),
      metadata: { amount, recipient: normalizedRecipient },
    }, { publish: false });

    const status = eventResult.action === 'BLOCK'
      ? 'BLOCKED'
      : eventResult.action === 'STEP_UP' ? 'STEP_UP' : 'ALLOWED';
    const transaction = await database.transaction.create({
      data: { userId: user.id, amount, recipient: normalizedRecipient, status },
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

  async function resetDemoState(userId = 'demo-user') {
    const user = await database.user.upsert({
      where: { id: userId },
      update: { trustScore: 90 },
      create: {
        id: userId,
        name: userId === 'demo-user' ? 'Demo User' : `Demo User ${userId}`,
        phoneNumber: `+254700000${String(Math.random()).slice(-6)}`,
        trustScore: 90,
      },
      include: { devices: true },
    });

    await database.$transaction(async (transaction) => {
      await transaction.transaction.deleteMany({ where: { userId } });
      await transaction.event.deleteMany({ where: { userId } });
      if (user.devices.length) {
        await transaction.device.updateMany({
          where: { userId },
          data: {
            trusted: true,
            manufacturer: 'Sentinel',
            model: 'Demo Device',
            os: 'Android',
            osVersion: '14',
            trustedLatitude: null,
            trustedLongitude: null,
          },
        });
      } else {
        await transaction.device.create({
          data: {
            userId,
            installationId: 'demo-installation',
            manufacturer: 'Sentinel',
            model: 'Demo Device',
            os: 'Android',
            osVersion: '14',
            trusted: true,
          },
        });
      }
      await transaction.user.update({ where: { id: userId }, data: { trustScore: 90 } });
    });

    return {
      success: true,
      userId,
      trustScore: 90,
      action: 'ALLOW',
      eventsCleared: true,
      transactionsCleared: true,
    };
  }

  async function getProviderStatus(userId = 'demo-user') {
    const latestEvent = await database.event.findFirst({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { device: true },
    });
    const latestSource = latestEvent?.metadata && typeof latestEvent.metadata === 'object'
      ? String(latestEvent.metadata.source || 'system')
      : 'system';
    const recentCount = await database.event.count({ where: userId ? { userId } : undefined });
    const registry = resolveProviderRegistry({ userId, lastEventSource: latestSource, eventCount: recentCount });

    return {
      userId,
      lastEventSource: latestSource,
      lastUpdated: latestEvent?.createdAt?.toISOString() || new Date().toISOString(),
      lastEventType: latestEvent?.type || 'NONE',
      providers: registry.providers,
      counts: {
        events: recentCount,
      },
    };
  }

  return { createTransaction, getEvents, getProviderStatus, getTransactions, getTrust, processEvent, resetDemoState, simulateEvent };
}

module.exports = { createEventService };
