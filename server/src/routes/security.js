const express = require('express');

function createSecurityRouter(eventService) {
  const router = express.Router();

  router.get('/summary', async (req, res, next) => {
    try {
      const summary = await eventService.getProviderStatus(req.query.userId || 'demo-user');
      return res.json({ success: true, summary });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createSecurityRouter };
