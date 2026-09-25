import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import Media from "../../models/Media.js";
import { envs } from "../../config/index.js";

const PREVIEW_LIMIT = 3;

/**
 * Lightweight product preview for order-list cards: the first few line items
 * per order with name, quantity and one image, so customers recognise an
 * order by what's in it rather than its number. Four queries per page,
 * regardless of page size. Names prefer the order-time snapshot so a later
 * product rename doesn't rewrite history.
 *
 * @returns {Map<string, {name: string, image: string|null, quantity: number}[]>}
 */
export async function orderItemPreviews(orderIds) {
  const previews = new Map();
  if (!orderIds.length) return previews;
  const rows = await OrderItem.find({ order_id: { $in: orderIds } })
    .select("order_id product_id variation_id product_name variation_name quantity")
    .sort({ _id: 1 })
    .lean();
  const byOrder = new Map();
  for (const row of rows) {
    const key = String(row.order_id);
    const list = byOrder.get(key) || [];
    if (list.length < PREVIEW_LIMIT) list.push(row);
    byOrder.set(key, list);
  }
  const picked = [...byOrder.values()].flat();
  const [products, variations] = await Promise.all([
    Product.find({ _id: { $in: picked.map((r) => r.product_id).filter(Boolean) } }).select("name images").lean(),
    ProductVariation.find({ _id: { $in: picked.map((r) => r.variation_id).filter(Boolean) } }).select("images").lean(),
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const variationById = new Map(variations.map((v) => [String(v._id), v]));
  const firstImageId = (row) =>
    variationById.get(String(row.variation_id))?.images?.[0] || productById.get(String(row.product_id))?.images?.[0] || null;
  const mediaIds = picked.map(firstImageId).filter(Boolean);
  const media = mediaIds.length ? await Media.find({ _id: { $in: mediaIds } }).select("url").lean() : [];
  const urlById = new Map(media.map((m) => [String(m._id), m.url ? `${envs.s3.BASE_URL}${m.url}` : null]));

  for (const [key, list] of byOrder) {
    previews.set(
      key,
      list.map((row) => {
        const base = row.product_name || productById.get(String(row.product_id))?.name || "Product";
        return {
          name: row.variation_name ? `${base} (${row.variation_name})` : base,
          image: urlById.get(String(firstImageId(row))) || null,
          quantity: row.quantity || 0,
        };
      })
    );
  }
  return previews;
}
