const cron = require("node-cron");
const { runReconciliation } = require("../services/reconciliationService");
const providerClient = require("../providers/stripeClient");

cron.schedule("0 2 * * *", async () => {
  console.log("Running daily reconciliation...");
  try {
    await runReconciliation(providerClient);
  } catch (err) {
    console.error("Reconciliation failed:", err.message);
  }
});
