import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { faqController } from "../../controllers/admin/index.js";
import { faqValidation } from "../../validations/admin/index.js";

const faqRouter = Router();

faqRouter.get("/list", requirePermission("faqs.view"), faqValidation.list, faqController.list);

faqRouter.post("/add", (req, res, next) => requirePermission(req.body._id ? "faqs.update" : "faqs.create")(req, res, next), faqValidation.add, faqController.add);

faqRouter.delete("/delete", requirePermission("faqs.delete"), faqValidation.remove, faqController.remove);

export { faqRouter };
