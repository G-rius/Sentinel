const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const request = require('supertest');
const { createServer, prisma } = require('../src/server');

let runtime;
let testUserId = 'demo-user';
let baseUrl;
let auth;

before(async () => {
  process.env.DEMO_MODE = 'true';
  await prisma.transaction.deleteMany({ where: { userId: testUserId } });
  await prisma.event.deleteMany({ where: { userId: testUserId } });
  await prisma.device.deleteMany({ where: { userId: testUserId } });
  await prisma.user.upsert({
    where: { id: testUserId },
    update: { name: 'Demo Reset', phoneNumber: `+2547${Date.now().toString().slice(-8)}`, trustScore: 90 },
    create: { id: testUserId, name: 'Demo Reset', phoneNumber: `+2547${Date.now().toString().slice(-8)}`, trustScore: 90 },
  });
  const device = await prisma.device.create({
    data: {
      userId: testUserId,
      installationId: 'demo-installation',
      manufacturer: 'Sentinel',
      model: 'Demo Device',
      os: 'Android',
      osVersion: '14',
      trusted: true,
    },
  });
  await prisma.event.create({
    data: {
      userId: testUserId,
      deviceId: device.id,
      type: 'LARGE_TRANSACTION',
      timestamp: new Date().toISOString(),
      metadata: { source: 'mobile', amount: 1000 },
      riskDelta: -15,
      resultingTrust: 75,
      action: 'STEP_UP',
    },
  });
  await prisma.transaction.create({
    data: { userId: testUserId, amount: 1000, recipient: '0712345678', status: 'STEP_UP' },
  });

  runtime = createServer({ database: prisma });
  await new Promise((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${runtime.server.address().port}`;
  auth = Buffer.from(`${process.env.API_USERNAME || 'sentinel'}:${process.env.API_PASSWORD || 'sentinel-dev'}`).toString('base64');
});

after(async () => {
  delete process.env.DEMO_MODE;
  if (runtime) await new Promise((resolve) => runtime.io.close(resolve));
  if (testUserId) {
    await prisma.transaction.deleteMany({ where: { userId: testUserId } });
    await prisma.event.deleteMany({ where: { userId: testUserId } });
    await prisma.device.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  }
  await prisma.$disconnect();
});

test('demo reset restores the known demo state', async () => {
  const response = await request(baseUrl)
    .post('/demo/reset')
    .set('Authorization', `Basic ${auth}`)
    .send({ userId: testUserId })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.userId, testUserId);
  assert.equal(response.body.trustScore, 90);
  assert.equal(response.body.action, 'ALLOW');
  assert.equal(response.body.eventsCleared, true);
  assert.equal(response.body.transactionsCleared, true);

  const trust = await request(baseUrl)
    .get(`/users/${testUserId}/trust`)
    .set('Authorization', `Basic ${auth}`)
    .expect(200);
  assert.equal(trust.body.trustScore, 90);
});

test('demo reset creates a clean demo user when one is missing', async () => {
  const freshUserId = `demo-missing-${Date.now()}`;
  const response = await request(baseUrl)
    .post('/demo/reset')
    .set('Authorization', `Basic ${auth}`)
    .send({ userId: freshUserId })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.userId, freshUserId);
  assert.equal(response.body.trustScore, 90);

  const user = await prisma.user.findUnique({ where: { id: freshUserId }, include: { devices: true } });
  assert.ok(user);
  assert.equal(user.trustScore, 90);
  assert.equal(user.devices.length >= 1, true);

  await prisma.transaction.deleteMany({ where: { userId: freshUserId } });
  await prisma.event.deleteMany({ where: { userId: freshUserId } });
  await prisma.device.deleteMany({ where: { userId: freshUserId } });
  await prisma.user.delete({ where: { id: freshUserId } });
});

test('demo mode blocks reset when disabled', async () => {
  process.env.DEMO_MODE = 'false';
  const response = await request(baseUrl)
    .post('/demo/reset')
    .set('Authorization', `Basic ${auth}`)
    .expect(403);

  assert.equal(response.body.error.code, 'DEMO_DISABLED');
  process.env.DEMO_MODE = 'true';
});
