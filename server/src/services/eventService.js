const { randomUUID } = require('node:crypto');

const events = [];

function createEvent(event) {
  const storedEvent = {
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    ...event,
  };

  events.push(storedEvent);
  return storedEvent;
}

module.exports = { createEvent };
