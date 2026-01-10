import { Router } from "express";
import { paypalRouter } from "./paypal.js";
const v1CallBackRouter = Router();
// All routes go here

v1CallBackRouter.use("/paypal", paypalRouter);

export { v1CallBackRouter };
