import { requireRecaptcha } from "../../middleware/recaptcha.js";
import { Router } from "express";
import { ratingController } from "../../controllers/user/index.js";
import { ratingValidation } from "../../validations/user/index.js";

const ratingRouter = Router();

ratingRouter.post("/add", requireRecaptcha("review"), ratingValidation.add, ratingController.add);
ratingRouter.get("/list", ratingValidation.list, ratingController.list);

export { ratingRouter };
