const mongoose = require("mongoose");

const ReconciliationRunSchema = new mongoose.Schema({
  provider: { type: String, required: true }, // e.g. stripe, paystack
  status: { type: String, enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED"], default: "PENDING" },
  cursor: { type: String },
  summary: { type: Object },
}, { timestamps: true });

module.exports = mongoose.model("ReconciliationRun", ReconciliationRunSchema);
