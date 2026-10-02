const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, test } = require('node:test');
const request = require('supertest');
const { createServer, prisma } = require('../src/server');

let runtime; 
let testUserId; 
let baseUrl;

before(async () => {
  testUserId = `integration-${randomUUID()}`;
  await prisma.user.create({
    data: { id: testUserId, name: 'Security Test', phoneNumber: `+2547${Date.now().toString().slice(-8)}`, trustScore: 90 },
  });
  await prisma.device.create({
    data: {
      userId: testUserId,
      installationId: 'security-installation',
      manufacturer: 'Sentinel',
      model: 'Secure Device',
      os: 'Android',
      osVersion: '14',
      trusted: true,
    },
  });

  runtime = createServer({ database: prisma });
  await new Promise((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${runtime.server.address().port}`;
});

after(async () => {
  if (runtime) await new Promise((resolve) => runtime.io.close(resolve));
  if (testUserId) {
    await prisma.transaction.deleteMany({ where: { userId: testUserId } });
    await prisma.event.deleteMany({ where: { userId: testUserId } });
    await prisma.device.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  }
  await prisma.$disconnect();
});

test('requires auth for protected events endpoints', async () => {
  const response = await request(baseUrl)
    .post('/events')
    .send({
      id: `evt-${randomUUID()}`,
      type: 'TEST_EVENT',
      userId: testUserId,
      installationId: 'security-installation',
      source: 'mobile',
      timestamp: new Date().toISOString(),
      metadata: {},
    });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('duplicate event ids are not processed twice', async () => {
  const auth = Buffer.from(`${process.env.API_USERNAME || 'sentinel'}:${process.env.API_PASSWORD || 'sentinel-dev'}`).toString('base64');
  const payload = {
    id: `dup-${randomUUID()}`,
    type: 'TEST_EVENT',
    userId: testUserId,
    installationId: 'security-installation',
    source: 'mobile',
    timestamp: new Date().toISOString(),
    metadata: { source: 'mobile' },
  };

  const first = await request(baseUrl)
    .post('/events')
    .set('Authorization', `Basic ${auth}`)
    .send(payload)
    .expect(201);

  const second = await request(baseUrl)
    .post('/events')
    .set('Authorization', `Basic ${auth}`)
    .send(payload)
    .expect(200);

  assert.equal(first.body.eventId, second.body.eventId);
  assert.equal(first.body.duplicate, false);
  assert.equal(second.body.duplicate, true);
});

test('provider status summary is exposed for monitoring', async () => {
  const auth = Buffer.from(`${process.env.API_USERNAME || 'sentinel'}:${process.env.API_PASSWORD || 'sentinel-dev'}`).toString('base64');
  const response = await request(baseUrl)
    .get('/security/summary')
    .set('Authorization', `Basic ${auth}`)
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.summary.providers.sms.provider, 'sms');
  assert.equal(response.body.summary.providers.sms.status, 'ready');
  assert.equal(response.body.summary.providers.carrier.provider, 'carrier');
  assert.equal(response.body.summary.providers.carrier.status, 'ready');
  assert.ok(response.body.summary.lastEventSource);
});

test('invalid transaction amounts are rejected', async () => {
  const auth = Buffer.from(`${process.env.API_USERNAME || 'sentinel'}:${process.env.API_PASSWORD || 'sentinel-dev'}`).toString('base64');
  const response = await request(baseUrl)
    .post('/transactions')
    .set('Authorization', `Basic ${auth}`)
    .send({ userId: testUserId, amount: -100, recipient: '0712345678' });

  assert.equal(response.status, 400);
  assert.match(response.body.error.message, /positive/i);
});
