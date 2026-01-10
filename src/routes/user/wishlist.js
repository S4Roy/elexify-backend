import { Router } from "express";
import * as userController from "../../controllers/user/index.js";
import * as userValidation from "../../validations/user/index.js";

const wishListRouter = Router();

wishListRouter.get(
  "/",
  userValidation.productValidation.wishlist,
  userController.productController.wishlist
);
wishListRouter.put(
  "/toggle",
  userValidation.productValidation.toggleWishList,
  userController.productController.toggleWishList
);

export { wishListRouter };
