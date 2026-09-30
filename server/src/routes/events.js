const express = require('express');
const { EVENT_TYPE_SET } = require('../constants/eventTypes');

function createEventsRouter(eventService) {
  const router = express.Router();
  router.post('/', async (req, res, next) => {
    const requiredFields = ['type', 'userId', 'installationId', 'timestamp'];
    const missing = requiredFields.filter((field) => !req.body?.[field]);
    if (missing.length) {
      return res.status(400).json({ success: false, error: `Missing required field(s): ${missing.join(', ')}` });
    }
    if (!EVENT_TYPE_SET.has(req.body.type)) {
      return res.status(400).json({ success: false, error: 'Unknown event type' });
    }
    try {
      return res.status(201).json(await eventService.processEvent(req.body));
    } catch (error) {
      return next(error);
    }
  });
  return router;
}

module.exports = { createEventsRouter };
