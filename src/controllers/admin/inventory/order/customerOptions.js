import User from "../../../../models/User.js";

// Typeahead source for the "Customer" filter on the admin Orders list
// (routes/admin/inventory/order.js "/list" itself has no permission gate,
// so this doesn't have one either — unlike "/create-options", which is
// gated behind ORDER_CREATE for the order-creation flow it actually
// serves). Kept as its own small endpoint rather than reusing
// createOptions so viewing/filtering orders never depends on a
// create-order permission.
export const customerOptions = async (req, res, next) => {
  try {
    const search = String(req.query.search || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // No `status: 'active'` filter here (unlike createOptions' customer
    // branch) — an admin filtering existing orders needs to find a
    // customer who has since been deactivated, not just ones eligible for
    // a new order.
    const filter = {
      role: "customer",
      deleted_at: null,
      ...(search ? { $or: ["name", "email", "mobile"].map((field) => ({ [field]: new RegExp(search, "i") })) } : {}),
    };
    const data = await User.find(filter)
      .select("name email mobile phone_code")
      .sort({ name: 1, _id: 1 })
      .limit(20)
      .lean();
    res.json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};
