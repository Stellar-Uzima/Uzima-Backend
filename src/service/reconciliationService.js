const ReconciliationRun = require("../models/ReconciliationRun");
const ReconciliationItem = require("../models/ReconciliationItem");
const ProviderCursor = require("../models/ProviderCursor");
const Transaction = require("../models/Transaction"); // your local payments collection

async function runReconciliation(providerClient, manualCursor) {
  const run = new ReconciliationRun({ provider: providerClient.name, status: "RUNNING", cursor: manualCursor });
  await run.save();

  try {
    let cursorDoc = await ProviderCursor.findOne({ provider: providerClient.name });
    let cursor = manualCursor || (cursorDoc ? cursorDoc.cursor : null);

    let processed = 0, mismatches = 0, nextCursor = cursor;

    do {
      const { items, nextCursor: providerNext } = await providerClient.listTransactions(nextCursor, 100);

      for (let tx of items) {
        processed++;

        const mismatch = await compareProviderTxToLocal(tx);
        if (mismatch) {
          mismatches++;
          await ReconciliationItem.create({
            runId: run._id,
            providerId: tx.id,
            localTransactionId: mismatch.localId,
            type: mismatch.type,
            details: mismatch.details
          });
        }
      }

      nextCursor = providerNext;
    } while (nextCursor);

    run.status = "COMPLETED";
    run.summary = { processed, mismatches };
    await run.save();

    if (!cursorDoc) {
      cursorDoc = new ProviderCursor({ provider: providerClient.name });
    }
    cursorDoc.cursor = nextCursor;
    cursorDoc.lastReconciledAt = new Date();
    await cursorDoc.save();

    return run;
  } catch (err) {
    run.status = "FAILED";
    run.summary = { error: err.message };
    await run.save();
    throw err;
  }
}

async function compareProviderTxToLocal(pTx) {
  const localTx = await Transaction.findOne({ providerId: pTx.id });
  if (!localTx) {
    return { type: "MISSING_LOCAL", details: { amount: pTx.amount }, localId: null };
  }
  if (localTx.amount !== pTx.amount) {
    return { type: "AMOUNT_MISMATCH", details: { local: localTx.amount, provider: pTx.amount }, localId: localTx._id };
  }
  if (pTx.refunded && !localTx.refunded) {
    return { type: "REFUND_MISSING", details: { providerRefunded: true }, localId: localTx._id };
  }
  return null;
}

module.exports = { runReconciliation };
