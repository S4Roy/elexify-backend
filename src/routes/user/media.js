import { Router } from "express";
import { mediaController } from "../../controllers/user/index.js";

const mediaRouter = Router();

mediaRouter.post("/upload", mediaController.upload);

export { mediaRouter };
