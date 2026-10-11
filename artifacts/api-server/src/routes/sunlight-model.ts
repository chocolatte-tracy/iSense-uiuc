import { Router } from 'express';
import { getSolarGrid, SOLAR_GRID_HASH } from '../lib/solar-grid-storage';

const router = Router();
// Fixed immutable public model, not an arbitrary file or prediction endpoint.
router.get(`/sunlight-model/grid/${SOLAR_GRID_HASH}`, async (_req, res) => {
  try {
    const bytes = await getSolarGrid();
    res.set('Content-Type', 'application/octet-stream');
    res.set('Cache-Control', 'public,max-age=31536000,immutable');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(bytes);
  } catch {
    res.status(503).set('Cache-Control', 'no-store').json({
      code: 'SUNLIGHT_MODEL_UNAVAILABLE',
      message: 'The historical terrain cache is unavailable. No sunlight prediction was applied.',
    });
  }
});
export default router;
