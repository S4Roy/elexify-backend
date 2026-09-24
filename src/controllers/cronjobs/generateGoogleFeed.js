import { inventoryService } from "../../services/index.js";

export const generateGoogleFeed = async (req, res) => {
  try {
    await inventoryService.productService.generateGoogleFeedFile();

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
