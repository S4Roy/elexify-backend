import { Router } from "express";
import { faqController } from "../../controllers/admin/index.js";
import { faqValidation } from "../../validations/admin/index.js";

const faqRouter = Router();

faqRouter.get("/list", faqValidation.list, faqController.list);

faqRouter.post("/add", faqValidation.add, faqController.add);

faqRouter.delete("/delete", faqValidation.remove, faqController.remove);

export { faqRouter };
