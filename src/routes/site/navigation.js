import { Router } from "express";
import { navigationController } from "../../controllers/site/index.js";

const navigationRouter = Router();

navigationRouter.get("/", navigationController.get);

export { navigationRouter };
