import { requireRecaptcha } from "../../middleware/recaptcha.js";
import { Router } from "express";
import { contactUsController } from "../../controllers/site/index.js";
import { contactUsValidation } from "../../validations/site/index.js";

const contactUsRouter = Router();

contactUsRouter.post(
  "/submit", requireRecaptcha("contact"),
  contactUsValidation.submit,
  contactUsController.submit
);

export { contactUsRouter };
