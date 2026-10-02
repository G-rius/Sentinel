require('dotenv').config();

const http = require('node:http');
const { randomUUID } = require('node:crypto');
const cors = require('cors');
const express = require('express');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { createEventService } = require('./services/eventService');
const { createEventsRouter } = require('./routes/events');
const { createUsersRouter } = require('./routes/users');
const { createTransactionsRouter } = require('./routes/transactions');
const { createSimulationRouter } = require('./routes/simulate');
const { createSecurityRouter } = require('./routes/security');
const { createDemoRouter } = require('./routes/demo');

const prisma = new PrismaClient();

function isDemoModeEnabled() {
  return !['false', '0', 'off', 'no'].includes(String(process.env.DEMO_MODE || 'true').toLowerCase());
}

function createServer({ database = prisma } = {}) {
  const app = express();
  const server = http.createServer(app);
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,https://*.app.github.dev')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isAllowedOrigin = (origin) => !origin || allowedOrigins.some((allowed) => (
    allowed === origin
    || (allowed === 'https://*.app.github.dev' && /^https:\/\/[^/]+-\d+\.app\.github\.dev$/.test(origin))
  ));
  const corsOptions = {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin is not allowed by CORS'));
    },
  };
  const io = new Server(server, { cors: corsOptions });
  const eventService = createEventService({
    database,
    broadcast(payload) {
      io.emit('trustUpdated', payload);
    },
  });

  const rateLimitStore = new Map();
  function enforceRateLimit(req, res, next) {
    const key = req.ip || 'local';
    const now = Date.now();
    const bucket = rateLimitStore.get(key) || [];
    const windowStart = now - 60 * 1000;
    const recent = bucket.filter((timestamp) => timestamp > windowStart);
    recent.push(now);
    rateLimitStore.set(key, recent);

    const maxPerMinute = req.path.startsWith('/events') || req.path.startsWith('/transactions') ? 60 : 300;
    if (recent.length > maxPerMinute) {
      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
      });
    }
    return next();
  }

  function requireApiAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const expectedUser = process.env.API_USERNAME || 'sentinel';
    const expectedPassword = process.env.API_PASSWORD || 'sentinel-dev';

    if (!authHeader.startsWith('Basic ')) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    }

    const encoded = authHeader.replace(/^Basic\s+/i, '');
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');

    if (username !== expectedUser || password !== expectedPassword) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials.' } });
    }

    req.requestId = randomUUID();
    return next();
  }

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, _res, next) => {
    req.requestId = req.headers['x-request-id'] || randomUUID();
    next();
  });
  app.use(enforceRateLimit);
  app.use((req, res, next) => {
    const protectedPaths = ['/events', '/transactions', '/users', '/simulate', '/security', '/demo'];
    const isProtected = protectedPaths.some((path) => req.path === path || req.path.startsWith(`${path}/`));
    if (isProtected) return requireApiAuth(req, res, next);
    return next();
  });

  app.get('/health', async (_req, res) => {
    try {
      await database.$queryRaw`SELECT 1`;
      return res.json({
        status: 'ok',
        service: 'sentinel-server',
        database: 'connected',
        demoMode: isDemoModeEnabled(),
        services: {
          database: 'ok',
          notificationProvider: process.env.AT_API_KEY ? 'ok' : 'unconfigured',
          eventEngine: 'ok',
        },
      });
    } catch (error) {
      return res.status(503).json({
        status: 'error',
        service: 'sentinel-server',
        database: 'unavailable',
        demoMode: isDemoModeEnabled(),
        services: {
          database: 'unavailable',
          notificationProvider: process.env.AT_API_KEY ? 'ok' : 'unconfigured',
          eventEngine: 'error',
        },
      });
    }
  });

  app.use('/events', createEventsRouter(eventService));
  app.use('/users', createUsersRouter(eventService));
  app.use('/simulate', createSimulationRouter(eventService));
  app.use('/security', createSecurityRouter(eventService));
  app.use('/demo', createDemoRouter(eventService));
  app.use('/transactions', createTransactionsRouter(eventService));

  app.use((error, _req, res, _next) => {
    if (error.message === 'Origin is not allowed by CORS') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN_ORIGIN', message: error.message } });
    }
    if (error.status && error.status < 500) {
      return res.status(error.status).json({ success: false, error: { code: error.code || 'INVALID_REQUEST', message: error.message } });
    }
    console.error(error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  return { app, server, io, eventService };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 4000;
  const { server } = createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Sentinel server listening on http://0.0.0.0:${port}`);
  });
}

module.exports = { createServer, prisma };
