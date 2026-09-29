const express = require('express');
const { createEvent } = require('../services/eventService');

const router = express.Router();
const requiredFields = ['type', 'userId', 'installationId', 'timestamp'];

router.post('/', (req, res) => {
  const missingFields = requiredFields.filter((field) => !req.body?.[field]);

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Missing required field(s): ${missingFields.join(', ')}`,
    });
  }

  const event = createEvent(req.body);
  console.log('Received event:', JSON.stringify(event));

  return res.status(201).json({
    success: true,
    eventId: event.id,
    receivedAt: event.receivedAt,
  });
});

module.exports = router;
