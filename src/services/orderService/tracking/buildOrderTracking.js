import Package from "../../../models/Package.js";
import OrderItem from "../../../models/OrderItem.js";
import OrderScans from "../../../models/OrderScans.js";
import Product from "../../../models/Product.js";
import Media from "../../../models/Media.js";
import MediaResource from "../../../resources/MediaResource.js";
import Address from "../../../models/Address.js";
import moment from "moment-timezone";
import { syncShipmentScans } from "./syncShipmentScans.js";

// Customer-facing tracking model for one order, shared by the logged-in
// account view and the public /track-order lookup:
//   milestones — the headline progress bar (Placed → … → Delivered)
//   shipments  — one per package (or the legacy order-level AWB), each with
//                courier/AWB/ETA and its full event log (courier scans +
//                our own package updates), newest first
//   activity   — order-level events (placed, paid, confirmed, cancelled…)
// Internal notes (manual status reasons, who changed what) never leave here.

export const ORDER_STATUS_LABELS = {
  pending: "Order placed",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  partially_shipped: "Partially shipped",
  out_for_delivery: "Out for delivery",
  partially_delivered: "Partially delivered",
  delivered: "Delivered",
  cancel_requested: "Cancellation requested",
  cancelled: "Cancelled",
  return_requested: "Return requested",
  returned: "Returned",
  failed: "Payment failed",
};

const PACKAGE_STATUS_LABELS = {
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return requested",
  returned: "Returned to seller",
  failed: "Delivery issue",
};

const PACKAGE_EVENT_TITLES = {
  packed: "Package packed and ready for pickup",
  shipped: "Handed over to courier",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Shipment cancelled",
  return_requested: "Return initiated",
  returned: "Returned to seller",
  failed: "Delivery attempt failed",
};

// Rank of each order status on the milestone bar.
const STEP_RANK = {
  pending: 0,
  confirmed: 1,
  processing: 1,
  cancel_requested: 1,
  packed: 2,
  shipped: 3,
  partially_shipped: 3,
  out_for_delivery: 4,
  partially_delivered: 5,
  delivered: 5,
  return_requested: 5,
  returned: 5,
};

const humanize = (s) =>
  String(s || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

const statusLabel = (s) => ORDER_STATUS_LABELS[s] || humanize(s) || "Processing";
const minDate = (dates) => {
  const valid = dates.filter(Boolean).map((d) => new Date(d)).filter((d) => !Number.isNaN(d.valueOf()));
  return valid.length ? new Date(Math.min(...valid)) : null;
};
const maxDate = (dates) => {
  const valid = dates.filter(Boolean).map((d) => new Date(d)).filter((d) => !Number.isNaN(d.valueOf()));
  return valid.length ? new Date(Math.max(...valid)) : null;
};
const byDateDesc = (a, b) => (b.at ? new Date(b.at) : 0) - (a.at ? new Date(a.at) : 0);
const historyAt = (order, ...statuses) =>
  minDate((order.manual_status_history || []).filter((h) => h.from !== h.to && statuses.includes(h.to)).map((h) => h.changed_at));
// Couriers report ETAs as "2026-09-24 23:59:59", "24 Sep 2026", … (IST).
const parseEtd = (value) => {
  if (!value) return null;
  const m = moment.tz(String(value).trim(), ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD", "DD MMM YYYY", "D MMM YYYY", "DD-MM-YYYY"], true, "Asia/Kolkata");
  return m.isValid() ? m.toDate() : null;
};
const placeName = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const fallbackTrackUrl = (awb) => (awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : null);

const loadItems = async (orderId) => {
  const items = await OrderItem.find({ order_id: orderId }).select("product_id product_name variation_name quantity").lean();
  const products = await Product.find({ _id: { $in: items.map((i) => i.product_id) } }).select("name slug images").lean();
  const firstImageIds = products.map((p) => p.images?.[0]).filter(Boolean);
  const media = await Media.find({ _id: { $in: firstImageIds } });
  // Media.url is a storage key; MediaResource turns it into the public URL.
  const mediaUrl = new Map(media.map((m) => [String(m._id), new MediaResource(m).exec().url]));
  const productById = new Map(products.map((p) => [String(p._id), p]));
  return new Map(
    items.map((i) => {
      const product = productById.get(String(i.product_id));
      return [
        String(i._id),
        {
          name: [i.product_name || product?.name || "Item", i.variation_name].filter(Boolean).join(" — "),
          slug: product?.slug || null,
          image: product?.images?.[0] ? mediaUrl.get(String(product.images[0])) || null : null,
          quantity: i.quantity,
        },
      ];
    }),
  );
};

const buildMilestones = (order, packages, scans) => {
  const status = order.order_status;
  const placed = order.created_at;
  if (status === "cancelled") {
    return [
      { key: "placed", label: "Order placed", at: placed, state: "done" },
      { key: "cancelled", label: "Cancelled", at: order.cancellation?.cancelled_at || historyAt(order, "cancelled"), state: "done", tone: "danger" },
    ];
  }
  if (status === "failed") {
    return [
      { key: "placed", label: "Order placed", at: placed, state: "done" },
      { key: "failed", label: "Payment failed", at: order.updated_at, state: "done", tone: "danger" },
    ];
  }

  const livePkgs = packages.filter((p) => p.status !== "cancelled");
  const pkgEventAt = (s) => minDate(livePkgs.flatMap((p) => (p.timeline || []).filter((e) => e.status === s).map((e) => e.occurred_at)));
  const ofdScanAt = minDate(scans.filter((s) => /out for delivery/i.test(`${s.status_label || ""} ${s.activity}`)).map((s) => s.date));

  const steps = [
    { key: "placed", label: "Order placed", at: placed },
    { key: "confirmed", label: "Confirmed", at: order.processing_at || order.paid_at || historyAt(order, "confirmed", "processing") },
    { key: "packed", label: "Packed", at: minDate(livePkgs.map((p) => p.created_at)) || historyAt(order, "packed") },
    {
      key: "shipped",
      label: status === "partially_shipped" ? "Partially shipped" : "Shipped",
      at: order.shipped_at || minDate(livePkgs.map((p) => p.shipped_at)) || historyAt(order, "shipped"),
    },
    { key: "out_for_delivery", label: "Out for delivery", at: pkgEventAt("out_for_delivery") || ofdScanAt || historyAt(order, "out_for_delivery") },
    {
      key: "delivered",
      label: status === "partially_delivered" ? "Partially delivered" : "Delivered",
      at: order.delivered_at || maxDate(livePkgs.map((p) => p.delivered_at)) || historyAt(order, "delivered"),
    },
  ];

  const rank = STEP_RANK[status] ?? 1;
  const milestones = steps.map((step, i) => ({
    ...step,
    // Never show a date on a step the order hasn't reached.
    at: i <= rank ? step.at || null : null,
    // The last step is only "done" once everything is delivered — a
    // partially delivered order keeps it as the current step.
    state: i < rank || (i === rank && i === steps.length - 1 && ["delivered", "return_requested", "returned"].includes(status)) ? "done" : i === rank ? "current" : "upcoming",
  }));

  if (status === "return_requested" || status === "returned") {
    milestones.push({
      key: status,
      label: statusLabel(status),
      at: historyAt(order, status),
      state: status === "returned" ? "done" : "current",
      tone: "warning",
    });
  }
  return milestones;
};

const buildShipment = ({ key, label, source, scans, items, publicView }) => {
  const courierEvents = scans.map((s) => ({
    at: s.date,
    title: s.activity,
    location: s.location || null,
    status_label: s.status_label || null,
    kind: "courier",
  }));
  const updates = (source.timeline || []).map((e) => ({
    at: e.occurred_at,
    title: PACKAGE_EVENT_TITLES[e.status] || humanize(e.status),
    location: null,
    status_label: null,
    kind: "update",
  }));
  const events = [...courierEvents, ...updates].sort(byDateDesc);
  const status = source.status || source.order_status;
  return {
    key,
    label,
    package_number: source.package_number ?? null,
    status,
    status_label: PACKAGE_STATUS_LABELS[status] || statusLabel(status),
    // Latest courier wording (e.g. "IN TRANSIT", "RTO INITIATED") — shown
    // alongside our own status since carriers report exceptions we don't map.
    courier_status: source.shiprocket_status || null,
    courier_name: source.courier_name || null,
    awb: source.awb || null,
    tracking_url: source.tracking_url?.startsWith?.("https://") ? source.tracking_url : fallbackTrackUrl(source.awb),
    etd: status === "delivered" ? null : source.etd || null,
    etd_at: status === "delivered" ? null : parseEtd(source.etd),
    shipped_at: source.shipped_at || null,
    delivered_at: source.delivered_at || null,
    items: publicView ? items.map(({ slug, ...rest }) => rest) : items,
    events,
    last_event_at: events[0]?.at || null,
  };
};

const buildActivity = (order) => {
  const events = [{ at: order.created_at, title: "Order placed" }];
  if (order.paid_at && order.payment_method !== "cod") events.push({ at: order.paid_at, title: "Payment received" });
  if (order.processing_at) events.push({ at: order.processing_at, title: "Order confirmed" });
  const seen = new Set(events.map((e) => e.title));
  for (const h of order.manual_status_history || []) {
    if (!h.to || h.from === h.to || !ORDER_STATUS_LABELS[h.to]) continue;
    const title = `Order ${statusLabel(h.to).toLowerCase()}`;
    if (seen.has(title)) continue;
    seen.add(title);
    events.push({ at: h.changed_at, title });
  }
  if (order.cancellation?.requested_at) events.push({ at: order.cancellation.requested_at, title: "Cancellation requested" });
  if (order.cancellation?.cancelled_at && !seen.has("Order cancelled")) events.push({ at: order.cancellation.cancelled_at, title: "Order cancelled" });
  if (order.refund?.status === "processed" && order.refund.completed_at) events.push({ at: order.refund.completed_at, title: "Refund processed" });
  return events.map((e) => ({ ...e, kind: "order" })).sort(byDateDesc);
};

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), ms))]);

/**
 * @param order     lean Order document
 * @param publicView  true for the unauthenticated /track-order lookup — omits
 *                    prices, street address and product links
 * @param refresh   pull fresh courier scans (throttled) before building
 */
export const buildOrderTracking = async (order, { publicView = false, refresh = true } = {}) => {
  let packages = await Package.find({ order_id: order._id, integration_status: { $ne: "failed" } })
    .sort({ package_number: 1 })
    .lean();

  if (refresh) {
    // Wait briefly for fresh scans; a slow courier API must not stall the page.
    // The sync keeps running and the next view picks up what it stored.
    const result = await withTimeout(syncShipmentScans({ order, packages }), 4000);
    if (result?.refreshed) {
      packages = await Package.find({ order_id: order._id, integration_status: { $ne: "failed" } })
        .sort({ package_number: 1 })
        .lean();
    }
  }

  const [scans, itemsById] = await Promise.all([
    OrderScans.find({ order_id: order._id }).sort({ date: -1 }).lean(),
    loadItems(order._id),
  ]);

  let shipments = [];
  if (packages.length) {
    shipments = packages.map((pkg) =>
      buildShipment({
        key: String(pkg._id),
        label: packages.length > 1 ? `Package ${pkg.package_number}` : "Shipment",
        source: pkg,
        scans: scans.filter((s) => (s.package_id && String(s.package_id) === String(pkg._id)) || (!s.package_id && pkg.awb && s.awb === pkg.awb)),
        items: (pkg.items || [])
          .map((line) => {
            const item = itemsById.get(String(line.order_item_id));
            return item ? { ...item, quantity: line.quantity } : null;
          })
          .filter(Boolean),
        publicView,
      }),
    );
  } else if (order.awb || order.courier_name || scans.length) {
    shipments = [
      buildShipment({
        key: "order",
        label: "Shipment",
        source: { ...order, status: order.order_status },
        scans,
        items: [...itemsById.values()],
        publicView,
      }),
    ];
  }

  const address = order.shipping_address_snapshot || (order.shipping_address ? await Address.findById(order.shipping_address).lean() : null);
  const inTransit = shipments.filter((s) => !["delivered", "cancelled", "returned"].includes(s.status));
  const allItems = [...itemsById.values()];

  return {
    order: {
      ...(publicView ? {} : { _id: order._id }),
      id: order.id,
      placed_at: order.created_at,
      status: order.order_status,
      status_label: statusLabel(order.order_status),
      payment_method: order.payment_method || null,
      ...(publicView ? {} : { grand_total: order.grand_total, currency: order.currency || "INR" }),
      item_count: allItems.reduce((n, i) => n + (i.quantity || 0), 0),
      delivered_at: order.delivered_at || null,
      cancelled_at: order.cancellation?.cancelled_at || null,
    },
    destination: address
      ? {
          ...(publicView ? {} : { name: address.full_name || null }),
          // Live Address docs use city_name/state_name; order snapshots store the names in city/state.
          city: placeName(address.city_name) || placeName(address.city),
          state: placeName(address.state_name) || placeName(address.state),
          postcode: address.postcode || null,
        }
      : null,
    expected_delivery: inTransit.map((s) => s.etd).find(Boolean) || null,
    // When everything still on the way should have arrived — the latest ETA
    // across in-transit shipments (each shipment also carries its own).
    expected_delivery_at: maxDate(inTransit.map((s) => s.etd_at)),
    milestones: buildMilestones(order, packages, scans),
    shipments,
    // Items not yet in any package (multi-package orders mid-fulfilment).
    unshipped_items:
      packages.length && !publicView
        ? (() => {
            const packed = new Map();
            packages
              .filter((p) => p.status !== "cancelled")
              .forEach((p) => (p.items || []).forEach((l) => packed.set(String(l.order_item_id), (packed.get(String(l.order_item_id)) || 0) + l.quantity)));
            return [...itemsById.entries()]
              .map(([id, item]) => ({ ...item, quantity: item.quantity - (packed.get(id) || 0) }))
              .filter((i) => i.quantity > 0);
          })()
        : [],
    activity: buildActivity(order),
    generated_at: new Date(),
  };
};
