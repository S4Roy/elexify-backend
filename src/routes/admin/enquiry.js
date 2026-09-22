import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { enquiryController } from "../../controllers/admin/index.js";
import { enquiryValidation } from "../../validations/admin/index.js";

const enquiryRouter = Router();

enquiryRouter.get("/list", requirePermission("enquiries.view"), enquiryValidation.list, enquiryController.list);
enquiryRouter.put("/edit", requirePermission("enquiries.update"), enquiryValidation.edit, enquiryController.edit);
enquiryRouter.delete(
  "/delete", requirePermission("enquiries.delete"),
  enquiryValidation.remove,
  enquiryController.remove
);

export { enquiryRouter };
