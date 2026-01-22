const mongoose = require("mongoose");

const ReconciliationItemSchema = new mongoose.Schema({
  runId: { type: mongoose.Schema.Types.ObjectId, ref: "ReconciliationRun", required: true },
  providerId: { type: String, required: true },
  localTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
  type: { 
    type: String, 
    enum: ["MISSING_LOCAL", "MISSING_PROVIDER", "AMOUNT_MISMATCH", "REFUND_MISSING", "OTHER"], 
    required: true 
  },
  details: { type: Object },
  alerted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("ReconciliationItem", ReconciliationItemSchema);

