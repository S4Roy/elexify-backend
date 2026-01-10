import { Router } from "express";
import { adminAuthRouter } from "./admin.js";
import { userAuthRouter } from "./user.js";

const v1AuthRouter = Router();
// All routes go here

v1AuthRouter.use("/admin", adminAuthRouter);
v1AuthRouter.use("/user", userAuthRouter);

export { v1AuthRouter };
