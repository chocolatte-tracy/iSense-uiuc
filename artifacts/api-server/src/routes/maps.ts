import { Router } from "express";
import { getPublicMapsConfig } from "../lib/google-routes.mjs";

const router = Router();
router.get("/maps/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getPublicMapsConfig());
});
// No second Routes implementation. Old clients must move to the POST adapter.
router.get("/maps/routes", (_req, res) => {
  res.status(410).json({ error: "Use POST /api/walking-routes." });
});
export default router;
