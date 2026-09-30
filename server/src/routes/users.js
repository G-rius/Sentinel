const express = require('express');

function createUsersRouter(eventService) {
  const router = express.Router();

  router.get('/:id/trust', async (req, res, next) => {
    try {
      return res.json(await eventService.getTrust(req.params.id));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:id/events', async (req, res, next) => {
    try {
      return res.json(await eventService.getEvents(req.params.id, req.query.limit));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createUsersRouter };
