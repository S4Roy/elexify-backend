import { Router } from "express";
import { bannerController } from "../../controllers/admin/index.js";
import { bannerValidation } from "../../validations/admin/index.js";

const bannerRouter = Router();

bannerRouter.get("/list", bannerValidation.list, bannerController.list);

bannerRouter.post("/add", bannerValidation.add, bannerController.add);
bannerRouter.put("/edit", bannerValidation.edit, bannerController.edit);

bannerRouter.delete(
  "/delete",
  bannerValidation.remove,
  bannerController.remove
);

export { bannerRouter };
