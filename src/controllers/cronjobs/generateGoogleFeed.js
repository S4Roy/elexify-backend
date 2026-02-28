import { inventoryService } from "../../services/index.js";

export const generateGoogleFeed = async (req, res) => {
  try {
    console.log("Generating Google Merchant Feed...");
    await inventoryService.productService.generateGoogleFeedFile();
    return res.json({
      status: "success",
      message: "Google Feed Generated Successfully",
    });
  } catch (error) {
    console.error("Feed generation failed:", error);
  }
};
