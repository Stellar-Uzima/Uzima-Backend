import express from "express";
import { anonymizeData } from "../controllers/anonymize.controller.js";

const router = express.Router();

router.post("/data/anonymize", anonymizeData);

export default router;
