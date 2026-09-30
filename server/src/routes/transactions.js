const express = require('express');

function createTransactionsRouter(eventService) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      return res.json(await eventService.getTransactions(req.query.userId));
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const result = await eventService.createTransaction(req.body || {});
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createTransactionsRouter };
