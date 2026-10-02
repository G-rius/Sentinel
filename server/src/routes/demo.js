const express = require('express');

function isDemoModeEnabled() {
  return !['false', '0', 'off', 'no'].includes(String(process.env.DEMO_MODE || 'true').toLowerCase());
}

function createDemoRouter(eventService) {
  const router = express.Router();

  router.post('/reset', async (req, res, next) => {
    if (!isDemoModeEnabled()) {
      return res.status(403).json({ success: false, error: { code: 'DEMO_DISABLED', message: 'Demo mode is disabled.' } });
    }
    try {
      const userId = req.body?.userId || 'demo-user';
      const reset = await eventService.resetDemoState(userId);
      return res.json({ success: true, ...reset });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createDemoRouter };
