const express = require("express");
const router = express.Router();
const { runReconciliation } = require("../services/reconciliationService");
const ReconciliationRun = require("../models/ReconciliationRun");
const ReconciliationItem = require("../models/ReconciliationItem");

// Example provider client (Stripe, Paystack, etc.)
const providerClient = require("../providers/stripeClient");

// POST /reconciliation/:provider/run (manual run)
router.post("/:provider/run", async (req, res) => {
  try {
    const run = await runReconciliation(providerClient, req.query.cursor);
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reconciliation/runs
router.get("/runs", async (req, res) => {
  const runs = await ReconciliationRun.find().sort({ createdAt: -1 }).limit(50);
  res.json(runs);
});

// GET /reconciliation/runs/:id/items
router.get("/runs/:id/items", async (req, res) => {
  const items = await ReconciliationItem.find({ runId: req.params.id });
  res.json(items);
});

module.exports = router;
