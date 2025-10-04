import express from "express";
import AuditLog from "../models/auditLog.model.js";
import { verifyUser, verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/", verifyUser, verifyAdmin, async (req, res) => {
  try {
    const logs = await AuditLog.find().populate("userId", "email");
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
