const DEFAULT_PROVIDER_REGISTRY = Object.freeze({
  sms: {
    provider: 'sms',
    status: 'ready',
    label: 'SMS gateway',
    healthy: true,
  },
  carrier: {
    provider: 'carrier',
    status: 'ready',
    label: 'Carrier feed',
    healthy: true,
  },
  device: {
    provider: 'device',
    status: 'idle',
    label: 'Device registry',
    healthy: true,
  },
  audit: {
    provider: 'audit',
    status: 'ready',
    label: 'Audit trail',
    healthy: true,
  },
});

function resolveProviderRegistry({ userId, lastEventSource = 'system', eventCount = 0 } = {}) {
  const statusBySource = {
    mobile: 'ready',
    carrier: 'ready',
    dashboard: 'ready',
    system: 'ready',
  };

  const providers = {
    ...DEFAULT_PROVIDER_REGISTRY,
    device: {
      ...DEFAULT_PROVIDER_REGISTRY.device,
      status: eventCount > 0 ? 'ready' : 'idle',
    },
    sms: {
      ...DEFAULT_PROVIDER_REGISTRY.sms,
      status: statusBySource[lastEventSource] || 'ready',
    },
    carrier: {
      ...DEFAULT_PROVIDER_REGISTRY.carrier,
      status: statusBySource[lastEventSource] || 'ready',
    },
  };

  return {
    userId,
    providerStatus: 'ready',
    providers,
  };
}

module.exports = { DEFAULT_PROVIDER_REGISTRY, resolveProviderRegistry };
