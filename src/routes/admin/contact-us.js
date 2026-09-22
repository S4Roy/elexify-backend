import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { contactUsController } from "../../controllers/admin/index.js";
import { contactUsValidation } from "../../validations/admin/index.js";

const contactUsRouter = Router();

contactUsRouter.get(
  "/list", requirePermission("contacts.view"),
  contactUsValidation.list,
  contactUsController.list
);
contactUsRouter.put(
  "/edit", requirePermission("contacts.update"),
  contactUsValidation.edit,
  contactUsController.edit
);
contactUsRouter.delete(
  "/delete", requirePermission("contacts.delete"),
  contactUsValidation.remove,
  contactUsController.remove
);

export { contactUsRouter };
