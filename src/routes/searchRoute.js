import express from "express";
import { search } from "../controllers/search.controller.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = express.Router();

// Search endpoint (cached for 5 minutes, includes query params in cache key)
router.get(
  "/",
  cacheMiddleware({
    prefix: "search",
    ttl: 300, // 5 minutes
    queryParams: ["q", "page", "limit"],
  }),
  search
);

export default router;
