import { Router } from "express";
import { inventoryRouter } from "./inventory/index.js";
import { pageRouter } from "./page.js";
import { cmsRouter } from "./cms.js";
import { consultationRouter } from "./consultation.js";
import { contactUsRouter } from "./contact_us.js";
import { subscriberRouter } from "./subscriber.js";
import { webhookRouter } from "./webhook/index.js";
import { commonRouter } from "./common.js";

const v1SiteRouter = Router();
// All routes go here

v1SiteRouter.use("/inventory", inventoryRouter);
v1SiteRouter.use("/page", pageRouter);
v1SiteRouter.use("/cms", cmsRouter);
v1SiteRouter.use("/consultation", consultationRouter);
v1SiteRouter.use("/contact-us", contactUsRouter);
v1SiteRouter.use("/subscriber", subscriberRouter);
v1SiteRouter.use("/webhook", webhookRouter);
v1SiteRouter.use("/common", commonRouter);

export { v1SiteRouter };
