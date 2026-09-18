import mongoose from "mongoose";
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import Package from "../../../../models/Package.js";
import { StatusError } from "../../../../config/index.js";
import { orderService } from "../../../../services/index.js";
import { summarizePackageQuantities } from "../../../../services/orderService/derivePackageOrderStatus.js";
import PackageResource from "../../../../resources/PackageResource.js";

// Powers the admin "Manage Packages" dialog: every order item with its
// Unpacked/Packed/Shipped breakdown, plus every package already created
// for the order (courier/AWB/status/retry-cancel eligibility).
export const list = async (req, res, next) => {
  try {
    const { order_id } = req.query;
    if (!order_id || !mongoose.Types.ObjectId.isValid(order_id)) {
      throw StatusError.badRequest("order_id is required");
    }

    const order = await Order.findOne({ _id: order_id, deleted_at: null }).select("id").lean();
    if (!order) throw StatusError.notFound("Order not found");

    const [orderItems, packages] = await Promise.all([
      OrderItem.find({ order_id }).select("product_name sku variation_name quantity").lean(),
      Package.find({ order_id }).sort({ package_number: 1 }).lean(),
    ]);

    const nonCancelled = packages.filter((pkg) => pkg.status !== "cancelled");
    const { items } = summarizePackageQuantities(orderItems, nonCancelled);
    const summaryByItemId = new Map(items.map((item) => [String(item.order_item_id), item]));

    const order_items = orderItems.map((item) => {
      const summary = summaryByItemId.get(String(item._id)) || { allocated_qty: 0, shipped_qty: 0 };
      return {
        _id: item._id,
        product_name: item.product_name,
        sku: item.sku,
        variation_name: item.variation_name,
        quantity: item.quantity,
        packed_quantity: summary.allocated_qty,
        shipped_quantity: summary.shipped_qty,
        unpacked_quantity: Math.max(0, item.quantity - summary.allocated_qty),
      };
    });

    return res.status(200).json({
      status: "success",
      message: "Packages fetched successfully",
      data: { order_items, packages: PackageResource.collection(packages) },
    });
  } catch (error) {
    next(error);
  }
};

export const retry = async (req, res, next) => {
  try {
    const { package_id } = req.body;
    if (!package_id) throw StatusError.badRequest("package_id is required");
    const pkg = await orderService.retryPackageShipment({ packageId: package_id });
    return res.status(200).json({
      status: "success",
      message:
        pkg.integration_status === "created"
          ? `Package #${pkg.package_number} sent to ShipRocket successfully`
          : `Retry did not succeed: ${pkg.last_error}`,
      data: { package: new PackageResource(pkg).exec() },
    });
  } catch (error) {
    next(error);
  }
};

export const cancel = async (req, res, next) => {
  try {
    const { package_id } = req.body;
    if (!package_id) throw StatusError.badRequest("package_id is required");
    const pkg = await orderService.cancelPackage({ packageId: package_id });
    return res.status(200).json({
      status: "success",
      message: `Package #${pkg.package_number} cancelled`,
      data: { package: new PackageResource(pkg).exec() },
    });
  } catch (error) {
    next(error);
  }
};
