require('dotenv').config();

const http = require('node:http');
const cors = require('cors');
const express = require('express');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { createEventService } = require('./services/eventService');
const { createEventsRouter } = require('./routes/events');
const { createUsersRouter } = require('./routes/users');
const { createTransactionsRouter } = require('./routes/transactions');
const { createSimulationRouter } = require('./routes/simulate');

const prisma = new PrismaClient();

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

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await database.$queryRaw`SELECT 1`;
      return res.json({ status: 'ok', service: 'sentinel-server', database: 'connected' });
    } catch (error) {
      return res.status(503).json({ status: 'error', service: 'sentinel-server', database: 'unavailable' });
    }
  });

  app.use('/events', createEventsRouter(eventService));
  app.use('/users', createUsersRouter(eventService));
  app.use('/simulate', createSimulationRouter(eventService));
  app.use('/transactions', createTransactionsRouter(eventService));

  app.use((error, _req, res, _next) => {
    if (error.message === 'Origin is not allowed by CORS') {
      return res.status(403).json({ success: false, error: error.message });
    }
    if (error.status && error.status < 500) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    console.error(error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
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
