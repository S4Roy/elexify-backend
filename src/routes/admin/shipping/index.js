import { Router } from "express";
import { shippingClassRouter } from "./class.js";
import { shippingZoneRouter } from "./zone.js";
import { shippingRateRouter } from "./rate.js";
import { shippingSettingsRouter } from "./settings.js";

const shippingRouter = Router();

shippingRouter.use("/class", shippingClassRouter);
shippingRouter.use("/zone", shippingZoneRouter);
shippingRouter.use("/rate", shippingRateRouter);
shippingRouter.use("/settings", shippingSettingsRouter);

export { shippingRouter };
