import Enquiry from "../../../../models/Enquiry.js";
import User from "../../../../models/User.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import { StatusError } from "../../../../config/index.js";

/**
 * Create Enquiry (prevents duplicate open enquiries)
 */
export const enquiry = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;
    let {
      product_id,
      product_name,
      product_sku,
      variation_id,
      message,
      name,
      email,
      mobile,
      type,
      source,
      channel,
    } = req.body;
    let payload = {};

    // Basic validation
    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("Authentication required");
    }
    if (!product_id) {
      throw StatusError.badRequest("Product ID is required");
    }
    const product = await Product.findOne({
      _id: product_id,
      deleted_at: null,
    }).select("_id name sku");
    if (!product) {
      throw StatusError.notFound("Product not found");
    }
    if (variation_id) {
      const variation = await ProductVariation.findOne({
        _id: variation_id,
        product_id,
        deleted_at: null,
      }).select("_id sku");
      if (!variation) {
        throw StatusError.notFound("Product variation not found");
      }
      product_sku = variation.sku;
      payload.variation_id = variation._id;
    }
    if (!message) {
      throw StatusError.badRequest("Message is required");
    }

    // If user is logged in, auto-fill name/email/mobile if not provided
    let finalName = name;
    let finalEmail = email;
    let finalMobile = mobile;
    if (user_id) {
      const user = await User.findOne({
        _id: user_id,
        deleted_at: null,
      }).select("name email mobile");
      finalName = finalName || user.name;
      finalEmail = finalEmail || user.email;
      finalMobile = finalMobile || user.mobile;
    }
    if (!finalName) {
      throw StatusError.badRequest("Name is required");
    }
    if (!finalEmail) {
      throw StatusError.badRequest("Email is required");
    }
    if (!finalMobile) {
      throw StatusError.badRequest("Mobile number is required");
    }

    // ===== Prevent duplicate OPEN enquiry =====
    // Build query: same product, same variation (or null), status=open, same user (if logged in)
    // or same email+mobile for guest (to avoid guest duplicates)
    const duplicateQuery = {
      product_id,
      variation_id: variation_id || null,
      status: "open", // only consider open enquiries
      deleted_at: null,
    };

    if (user_id) {
      duplicateQuery.user_id = user_id;
    } else {
      // guest: match by email OR mobile (either one prevents duplicate)
      duplicateQuery.$or = [{ email: finalEmail }, { mobile: finalMobile }];
    }

    const existing = await Enquiry.findOne(duplicateQuery).select(
      "_id created_at"
    );
    if (existing) {
      // You already have an open enquiry for this product/variation
      // Return 409 Conflict
      return res.status(409).json({
        status: "error",
        message: req.__(
          "You already have an open enquiry for this product. We will get back to you soon."
        ),
        data: {
          enquiry_id: existing.custom_id,
          created_at: existing.created_at,
        },
      });
    }
    // ===== end duplicate check =====

    // Prepare enquiry data
    payload = {
      user_id,
      guest_id,
      product_id,
      variation_id: variation_id || null,
      product_name: product_name || product.name,
      product_sku: product_sku || product.sku,
      message,
      name: finalName,
      email: finalEmail,
      mobile: finalMobile,
      type: type || "ask_price",
      source: source || null,
      channel: channel || "web",
      user_agent: req.get("User-Agent"),
      referrer: req.get("Referrer") || null,
      source: req.body.source || "product_page",
    };
    const enquiry = new Enquiry(payload);
    await enquiry.save();

    return res.status(200).json({
      status: "success",
      message: req.__("Enquiry sent successfully"),
    });
  } catch (error) {
    next(error);
  }
};
