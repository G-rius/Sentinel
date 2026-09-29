require('dotenv').config();

const cors = require('cors');
const express = require('express');
const eventsRouter = require('./routes/events');

const app = express();
const port = Number(process.env.PORT) || 4000;
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin is not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'sentinel-server' });
});

app.use('/events', eventsRouter);

app.use((error, _req, res, _next) => {
  if (error.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ success: false, error: error.message });
  }

  console.error(error);
  return res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Sentinel server listening on http://0.0.0.0:${port}`);
});

module.exports = app;
