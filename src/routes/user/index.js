import { Router } from "express";
import { wishListRouter } from "./wishlist.js";
import { cartRouter } from "./cart.js";
import { addressRouter } from "./address.js";
import { accountRouter } from "./account.js";
import { ratingRouter } from "./rating.js";

const v1UserRouter = Router();
// All routes go here

v1UserRouter.use("/wishlist", wishListRouter);
v1UserRouter.use("/cart", cartRouter);
v1UserRouter.use("/address", addressRouter);
v1UserRouter.use("/account", accountRouter);
v1UserRouter.use("/rating", ratingRouter);

export { v1UserRouter };
