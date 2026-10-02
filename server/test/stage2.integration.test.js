const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, test } = require('node:test');
const request = require('supertest');
const { io: createSocket } = require('socket.io-client');
const { createServer, prisma } = require('../src/server');

let runtime;
let socket;
let baseUrl;
let testUserId;

before(async () => {
  testUserId = `integration-${randomUUID()}`;
  await prisma.user.create({
    data: { id: testUserId, name: 'Integration Test', phoneNumber: `+2547${Date.now().toString().slice(-8)}`, trustScore: 90 },
  });
  await prisma.device.create({
    data: {
      userId: testUserId,
      installationId: 'integration-installation',
      manufacturer: 'Sentinel Test',
      model: 'Integration Device',
      os: 'Android',
      osVersion: '14',
      trusted: true,
    },
  });

  runtime = createServer({ database: prisma });
  await new Promise((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${runtime.server.address().port}`;
  socket = createSocket(baseUrl, { transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
});

after(async () => {
  socket?.disconnect();
  if (runtime) await new Promise((resolve) => runtime.io.close(resolve));
  if (testUserId) {
    await prisma.transaction.deleteMany({ where: { userId: testUserId } });
    await prisma.event.deleteMany({ where: { userId: testUserId } });
    await prisma.device.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  }
  await prisma.$disconnect();
});

test('events update persisted trust, broadcast live, and gate a large transfer', async () => {
  const auth = Buffer.from(`${process.env.API_USERNAME || 'sentinel'}:${process.env.API_PASSWORD || 'sentinel-dev'}`).toString('base64');
  const health = await request(runtime.app).get('/health').expect(200);
  assert.equal(health.body.database, 'connected');

  const phoneEvent = await request(runtime.app)
    .post('/events')
    .set('Authorization', `Basic ${auth}`)
    .send({
      type: 'TEST_EVENT',
      userId: testUserId,
      installationId: 'integration-installation',
      device: { manufacturer: 'Sentinel Test', model: 'Integration Device', os: 'Android', osVersion: '14' },
      timestamp: new Date().toISOString(),
      metadata: {},
    })
    .expect(201);
  assert.equal(phoneEvent.body.trustScore, 90);
  assert.equal(phoneEvent.body.action, 'ALLOW');

  const broadcastPromise = new Promise((resolve) => socket.once('trustUpdated', resolve));
  const sim = await request(runtime.app)
    .post('/simulate')
    .set('Authorization', `Basic ${auth}`)
    .send({ type: 'SIM_REPLACEMENT', userId: testUserId })
    .expect(201);
  assert.equal(sim.body.trustScore, 60);
  assert.equal(sim.body.riskDelta, -30);
  assert.equal(sim.body.action, 'STEP_UP');
  const broadcast = await broadcastPromise;
  assert.equal(broadcast.trustScore, 60);
  assert.equal(broadcast.latestEvent.type, 'SIM_REPLACEMENT');

  const changed = await request(runtime.app)
    .post('/simulate')
    .set('Authorization', `Basic ${auth}`)
    .send({ type: 'DEVICE_CHANGED', userId: testUserId })
    .expect(201);
  assert.equal(changed.body.trustScore, 35);
  assert.equal(changed.body.action, 'BLOCK');

  const transfer = await request(runtime.app)
    .post('/transactions')
    .set('Authorization', `Basic ${auth}`)
    .send({ userId: testUserId, amount: 24000, recipient: '0712345678' })
    .expect(201);
  assert.equal(transfer.body.action, 'BLOCK');
  assert.equal(transfer.body.transaction.status, 'BLOCKED');

  const trust = await request(runtime.app).get(`/users/${testUserId}/trust`).set('Authorization', `Basic ${auth}`).expect(200);
  assert.equal(trust.body.trustScore, 20);
  const events = await request(runtime.app).get(`/users/${testUserId}/events`).set('Authorization', `Basic ${auth}`).expect(200);
  assert.equal(events.body.length, 4);
  assert.equal(events.body.at(0).type, 'LARGE_TRANSACTION');
  const transactions = await request(runtime.app).get(`/transactions?userId=${testUserId}`).set('Authorization', `Basic ${auth}`).expect(200);
  assert.equal(transactions.body[0].status, 'BLOCKED');
});
