import { Router } from "express";
import { contactUsController } from "../../controllers/admin/index.js";
import { contactUsValidation } from "../../validations/admin/index.js";

const contactUsRouter = Router();

contactUsRouter.get(
  "/list",
  contactUsValidation.list,
  contactUsController.list
);
contactUsRouter.put(
  "/edit",
  contactUsValidation.edit,
  contactUsController.edit
);
contactUsRouter.delete(
  "/delete",
  contactUsValidation.remove,
  contactUsController.remove
);

export { contactUsRouter };
