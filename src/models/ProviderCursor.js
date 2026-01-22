const mongoose = require("mongoose");

const ProviderCursorSchema = new mongoose.Schema({
  provider: { type: String, unique: true, required: true },
  cursor: { type: String },
  lastReconciledAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("ProviderCursor", ProviderCursorSchema);
