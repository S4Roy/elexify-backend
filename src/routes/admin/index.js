import { Router } from "express";
import { inventoryRouter } from "./inventory/index.js";
import { masterRouter } from "./master/index.js";
import { customerRouter } from "./customer.js";
import { mediaRouter } from "./media.js";
import { pageRouter } from "./page.js";
import { currencyRouter } from "./currency.js";
import { testimonialRouter } from "./testimonial.js";
import { faqRouter } from "./faq.js";
import { consultationRouter } from "./consultation.js";
import { bannerRouter } from "./banner.js";
import { blogRouter } from "./blog.js";
import { ratingRouter } from "./rating.js";
import { settingsRouter } from "./settings.js";
import { contactUsRouter } from "./contact-us.js";
import { subscriberRouter } from "./subscriber.js";
import { enquiryRouter } from "./enquiry.js";
import { countryRouter } from "./country.js";
import { stateRouter } from "./state.js";
import { cityRouter } from "./city.js";

const v1AdminRouter = Router();
// All routes go here

v1AdminRouter.use("/inventory", inventoryRouter);
v1AdminRouter.use("/master", masterRouter);
v1AdminRouter.use("/media", mediaRouter);
v1AdminRouter.use("/customer", customerRouter);
v1AdminRouter.use("/page", pageRouter);
v1AdminRouter.use("/currency", currencyRouter);
v1AdminRouter.use("/testimonial", testimonialRouter);
v1AdminRouter.use("/faq", faqRouter);
v1AdminRouter.use("/consultation", consultationRouter);
v1AdminRouter.use("/banner", bannerRouter);
v1AdminRouter.use("/blog", blogRouter);
v1AdminRouter.use("/rating", ratingRouter);
v1AdminRouter.use("/settings", settingsRouter);
v1AdminRouter.use("/contact-us", contactUsRouter);
v1AdminRouter.use("/subscriber", subscriberRouter);
v1AdminRouter.use("/enquiry", enquiryRouter);
v1AdminRouter.use("/country", countryRouter);
v1AdminRouter.use("/state", stateRouter);
v1AdminRouter.use("/city", cityRouter);

export { v1AdminRouter };
