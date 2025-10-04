import express from "express";
import { logAction } from "../middleware/auditLogger.js";
import { verifyUser } from "../middleware/auth.js";

const router = express.Router();

// Example CRUD operations
router.post("/", verifyUser, logAction("create"), (req, res) => {
  // Simulate creation
  res.status(201).json({ message: "Resource created" });
});

router.put("/:id", verifyUser, logAction("update"), (req, res) => {
  res.status(200).json({ message: `Resource ${req.params.id} updated` });
});

router.delete("/:id", verifyUser, logAction("delete"), (req, res) => {
  res.status(204).send();
});

export default router;
