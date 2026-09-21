import { Router } from "express";
import { addressAccountPhone } from "../../middleware/addressAccountPhone.js";
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
  addressAccountPhone,
  userValidation.addressValidation.add,
  userController.addressController.add
);
addressRouter.put(
  "/edit",
  addressAccountPhone,
  userValidation.addressValidation.edit,
  userController.addressController.edit
);
addressRouter.delete(
  "/delete",
  userValidation.addressValidation.remove,
  userController.addressController.remove
);
export { addressRouter };
