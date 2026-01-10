import { Router } from "express";
import { enquiryController } from "../../controllers/admin/index.js";
import { enquiryValidation } from "../../validations/admin/index.js";

const enquiryRouter = Router();

enquiryRouter.get("/list", enquiryValidation.list, enquiryController.list);
enquiryRouter.put("/edit", enquiryValidation.edit, enquiryController.edit);
enquiryRouter.delete(
  "/delete",
  enquiryValidation.remove,
  enquiryController.remove
);

export { enquiryRouter };
