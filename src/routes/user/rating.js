import { requireRecaptcha } from "../../middleware/recaptcha.js";
import { Router } from "express";
import { ratingController } from "../../controllers/user/index.js";
import { ratingValidation } from "../../validations/user/index.js";

import { reviewRateLimiter } from "../../middleware/rateLimiter.js";

const ratingRouter = Router();

ratingRouter.post("/add", reviewRateLimiter, requireRecaptcha("review"), ratingValidation.add, ratingController.add);
ratingRouter.get("/list", ratingValidation.list, ratingController.list);

export { ratingRouter };
