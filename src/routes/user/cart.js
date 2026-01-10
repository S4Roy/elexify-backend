import { Router } from "express";
import * as userController from "../../controllers/user/index.js";
import * as userValidation from "../../validations/user/index.js";

const cartRouter = Router();

cartRouter.get(
  "/list",
  userValidation.productValidation.carts,
  userController.productController.carts
);
cartRouter.put(
  "/manage",
  userValidation.productValidation.cartManage,
  userController.productController.cartManage
);

export { cartRouter };
