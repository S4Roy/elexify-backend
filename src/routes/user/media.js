import { Router } from "express";
import { mediaController } from "../../controllers/user/index.js";

import { reviewRateLimiter } from "../../middleware/rateLimiter.js";

const mediaRouter = Router();

mediaRouter.post("/upload", (req, res, next) => req.body?.purpose === "return" ? next() : reviewRateLimiter(req, res, next), mediaController.upload);

export { mediaRouter };
