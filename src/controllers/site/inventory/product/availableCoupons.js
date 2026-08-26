import Product from "../../../../models/Product.js";
import Coupon from "../../../../models/Coupon.js";

// Lists currently-active coupons that would apply to this product if it were
// added to cart, mirroring the eligibility rules in
// services/inventory/cart/validateCoupon.js (scope + exclusions). It does not
// check per-user/global usage limits — those are evaluated at apply-time.
export const availableCoupons = async (req, res, next) => {
  try {
    const { product_id, variation_id } = req.query;
    if (!product_id) {
      return res.status(200).json({
        status: "success",
        message: req.__("Data fetched successfully"),
        data: [],
      });
    }

    const product = await Product.findById(product_id)
      .select("brand categories sale_price regular_price ask_for_price enable_enquiry")
      .lean();
    if (!product) {
      return res.status(200).json({
        status: "success",
        message: req.__("Data fetched successfully"),
        data: [],
      });
    }

    const role = req.auth?.role || null;
    const applicableFor =
      role === "channel_partner" ? ["channel_partner", "both"] : ["user", "both"];

    const now = new Date();
    const coupons = await Coupon.find({
      status: "active",
      deleted_at: null,
      start_date: { $lte: now },
      end_date: { $gte: now },
      applicable_for: { $in: applicableFor },
    }).lean();

    const productIdStr = String(product_id);
    const isOnSale =
      product.sale_price > 0 && product.sale_price < product.regular_price;

    const eligible = coupons.filter((coupon) => {
      let ok = false;
      switch (coupon.applicable_scope) {
        case "all":
          ok = true;
          break;
        case "product":
          ok = coupon.applicable_products?.some(
            (id) => id.toString() === productIdStr,
          );
          break;
        case "variation":
          ok =
            !!variation_id &&
            coupon.applicable_variations?.some(
              (id) => id.toString() === String(variation_id),
            );
          break;
        case "brand":
          ok =
            !!product.brand &&
            coupon.applicable_brands?.some(
              (id) => id.toString() === product.brand.toString(),
            );
          break;
        case "category":
          ok = coupon.applicable_categories?.some((catId) =>
            product.categories?.some((c) => c.toString() === catId.toString()),
          );
          break;
      }
      if (!ok) return false;

      if (coupon.exclude_sale_items && isOnSale) return false;
      if (coupon.exclude_ask_for_price && product.ask_for_price) return false;
      if (coupon.exclude_enquiry_products && product.enable_enquiry) return false;

      return true;
    });

    const data = eligible.map((c) => ({
      code: c.code,
      title: c.title,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      max_discount_amount: c.max_discount_amount,
      min_cart_value: c.min_cart_value,
    }));

    res.status(200).json({
      status: "success",
      message: req.__("Data fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
