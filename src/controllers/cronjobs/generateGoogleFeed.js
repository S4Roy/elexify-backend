import { inventoryService } from "../../services/index.js";

// Core logic (reusable) — the hourly cron calls this directly.
export const regenerateGoogleFeed = () => inventoryService.productService.generateGoogleFeedFile();

// Express handler (debug route)
export const generateGoogleFeed = async (req, res) => {
  try {
    await regenerateGoogleFeed();

    return res.json({
      status: "success",
      message: "Google Feed Generated Successfully",
    });
  } catch (error) {
    console.error("Feed generation failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Google Feed Generation Failed",
    });
  }
};
