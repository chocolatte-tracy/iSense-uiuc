import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mapsRouter from "./maps";
import walkingRoutesRouter from "./walking-routes";
import communityReportsRouter from "./community-reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mapsRouter);
router.use(walkingRoutesRouter);
router.use(communityReportsRouter);

export default router;
