import { Router } from "express";
import { websiteAppLinks } from "../../services/mobileUpdatePolicy.js";

// Public store links for the storefront's "Get the app" footer block,
// controlled from Admin → Settings → App Updates.
const appLinksRouter = Router();
appLinksRouter.get("/", async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=60");
    res.json({ status: "success", data: await websiteAppLinks() });
  } catch (error) {
    next(error);
  }
});

export { appLinksRouter };
