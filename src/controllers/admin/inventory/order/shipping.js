import { StatusError } from "../../../../config/index.js";
import { orderService } from "../../../../services/index.js";

// Every shipment — including the simple "ship the whole order in one go"
// case (no `items` in the body, which is what today's admin panel always
// sends) — creates exactly one Package doc under the hood via
// orderService.createAndShipPackage. See src/services/orderService/
// packages/createAndShipPackage.js and the approved plan at
// /Users/subhankar/.claude/plans/optimized-sleeping-quokka.md. This keeps
// the endpoint/response shape the existing admin panel dialog already
// expects, while gaining an optional `items: [{order_item_id, quantity}]`
// payload for splitting an order across multiple packages.
export const shipping = async (req, res, next) => {
  try {
    const admin_id = req.auth?.user_id || null;
    const {
      _id = null,
      items = null,
      pickup_location,
      weight,
      length,
      width,
      height,
    } = req.body;

    if (!_id) throw StatusError.badRequest("_id (order id) is required in query");

    const { pkg } = await orderService.createAndShipPackage({
      orderId: _id,
      items,
      pickupLocation: pickup_location,
      weight,
      length,
      width,
      height,
      adminId: admin_id,
    });

    if (pkg.integration_status !== "created") {
      // The package was created and its items allocated, but Shiprocket's
      // own API call didn't confirm — surface this as an error so the
      // admin panel doesn't treat it as success, while the package itself
      // remains (for a "Retry" action) rather than the allocation being
      // silently lost.
      throw new StatusError(
        502,
        `Package #${pkg.package_number} was created but Shiprocket did not confirm the shipment: ${pkg.last_error}. Use Retry from Manage Packages.`,
      );
    }

    return res.status(200).json({
      status: "success",
      message: `Package #${pkg.package_number} sent to ShipRocket successfully`,
      data: { package: pkg },
    });
  } catch (error) {
    return next(error);
  }
};
