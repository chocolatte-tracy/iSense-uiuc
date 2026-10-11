import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mapsRouter from "./maps";
import walkingRoutesRouter from "./walking-routes";
import communityReportsRouter from "./community-reports";
import sunlightModelRouter from "./sunlight-model";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mapsRouter);
router.use(walkingRoutesRouter);
router.use(communityReportsRouter);
router.use(sunlightModelRouter);

export default router;
