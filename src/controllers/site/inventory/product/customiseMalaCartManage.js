import Wishlist from "../../../../models/Wishlist.js";
import Cart from "../../../../models/Cart.js";
import { StatusError } from "../../../../config/index.js";
import Category from "../../../../models/Category.js";
import Brand from "../../../../models/Brand.js";
import Attribute from "../../../../models/Attribute.js";
import AttributeValue from "../../../../models/AttributeValue.js";
import ProductCustomization from "../../../../models/ProductCustomization.js";
import TempCart from "../../../../models/TempCart.js";
import AttributeResource from "../../../../resources/AttributeResource.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import CategoryResource from "../../../../resources/CategoryResource.js";
import AttributeValueResource from "../../../../resources/AttributeValueResource.js";
/**
 * Get wishlist and cart counts for user or guest
 */
export const customiseMalaCartManage = async (req, res, next) => {
  try {
    const REQUIRED_BEADS = 108;

    const { user_id = null, guest_id = null } = req.auth || {};

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("User or Guest ID is required.");
    }
    const { combination_type, design_variation, mukhi_items, product_id } =
      req.body;

    if (!product_id) {
      throw StatusError.badRequest("Product ID is required.");
    }

    const product = await Product.findById(product_id).exec();
    if (!product) {
      throw StatusError.notFound("Product not found.");
    }
    /* ===============================
       1️⃣ Validate bead count
    =============================== */
    const totalBeads = mukhi_items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    if (totalBeads > REQUIRED_BEADS) {
      throw StatusError.badRequest("Total beads must be below or equal 108.");
    }
    /* ===============================
       2️⃣ Fetch Mukhi values
    =============================== */
    const mukhiValueIds = mukhi_items.map((i) => i.value_id);

    const mukhiValues = await AttributeValue.find({
      _id: { $in: mukhiValueIds },
      status: "active",
      deleted_at: null,
    }).lean();

    if (mukhiValues.length !== mukhi_items.length) {
      throw StatusError.badRequest("Invalid Mukhi selection.");
    }

    const mukhiMap = new Map(mukhiValues.map((v) => [v._id.toString(), v]));
    /* ===============================
       3️⃣ Price Calculation
    =============================== */
    let finalMukhiItems = [];
    let mukhiTotal = 0;

    for (const item of mukhi_items) {
      const mukhi = mukhiMap.get(item.value_id);

      const unitPrice = mukhi?.meta?.[item.bead_size];

      if (!unitPrice) {
        throw StatusError.badRequest(
          `Price not found for ${mukhi.name} (${item.bead_size})`
        );
      }

      const rowTotal = unitPrice * item.quantity;

      finalMukhiItems.push({
        attribute_id: mukhi.attribute_id,
        value_id: mukhi._id,
        bead_size: item.bead_size,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: rowTotal,
      });

      mukhiTotal += rowTotal;
    }
    /* ===============================
       4️⃣ Design variation price
    =============================== */
    let designCharge = 0;

    if (design_variation) {
      const design = await AttributeValue.findById(design_variation).lean();
      if (!design || design.status !== "active") {
        throw StatusError.badRequest("Invalid design variation.");
      }
      designCharge = design.price_modifier || 0;
    }

    /* ===============================
       5️⃣ Combination type price
    =============================== */
    const combination = await AttributeValue.findById(combination_type).lean();
    if (!combination || combination.status !== "active") {
      throw StatusError.badRequest("Invalid combination type.");
    }

    const combinationCharge = combination.price_modifier || 0;
    /* ===============================
       6️⃣ Final Price
    =============================== */
    const finalPrice = mukhiTotal + designCharge + combinationCharge;
    /* ===============================
       7️⃣ Create customization snapshot
    =============================== */
    const customization = await ProductCustomization.create({
      product_id,
      combination_type,
      design_variation,
      mukhi_items: finalMukhiItems,
      total_beads: totalBeads,
      total_price: finalPrice,
      created_by: user_id,
    });
    const baseFilter = user_id ? { user: user_id } : { guest_id };
    await TempCart.deleteMany({ ...baseFilter, deleted_at: null });
    /* ===============================
       8️⃣ Add to cart
    =============================== */
    await TempCart.create({
      ...baseFilter,
      product: product_id,
      customization_id: customization._id,
      quantity: 1,
      price: finalPrice,
    });
    return res.status(200).json({
      status: "success",
      message: "Customized Mala added to cart",
      data: {
        customization_id: customization._id,
        total_price: finalPrice,
      },
    });
  } catch (error) {
    next(error);
  }
};
