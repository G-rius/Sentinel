const express = require('express');
const { EVENT_TYPE_SET } = require('../constants/eventTypes');

function createSimulationRouter(eventService) {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    if (!EVENT_TYPE_SET.has(req.body?.type)) {
      return res.status(400).json({ success: false, error: 'A valid event type is required' });
    }
    try {
      return res.status(201).json(await eventService.simulateEvent(req.body));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createSimulationRouter };
