import { Router } from "express";
import * as userController from "../../controllers/user/index.js";
import * as userValidation from "../../validations/user/index.js";

const addressRouter = Router();

addressRouter.get(
  "/list",
  userValidation.addressValidation.list,
  userController.addressController.list
);
addressRouter.get("/default", userController.addressController.defaultAddress);
addressRouter.post(
  "/add",
  userValidation.addressValidation.add,
  userController.addressController.add
);
addressRouter.put(
  "/edit",
  userValidation.addressValidation.edit,
  userController.addressController.edit
);
addressRouter.delete(
  "/delete",
  userValidation.addressValidation.remove,
  userController.addressController.remove
);
export { addressRouter };
