import fs from "fs";
import path from "path";
import { create } from "xmlbuilder2";
import Product from "../../../models/Product.js";
import ProductVariation from "../../../models/ProductVariation.js";
import { envs } from "../../../config/index.js";

const imageUrl = (media) => (media?.url ? `${envs.s3.BASE_URL}${media.url}` : null);

// Google requires the feed price to exactly match what the landing page
// charges. `price` is always the undiscounted (MRP) amount; `sale_price` is
// only added when a genuine, lower sale price is set — mirrors how
// checkout/cart resolve the same two fields (see services/inventory/cart).
const priceFields = (regular, sale) => {
  const regularPrice = Number(regular) || 0;
  const rawSale = sale == null || sale === "" ? NaN : Number(sale);
  const hasSale = Number.isFinite(rawSale) && rawSale >= 0 && rawSale < regularPrice;
  return {
    price: `${regularPrice.toFixed(2)} INR`,
    salePrice: hasSale ? `${rawSale.toFixed(2)} INR` : null,
  };
};

// No real GTIN/MPN exists for most of the catalog — Google Merchant policy
// treats a fabricated identifier (e.g. reusing the SKU as an MPN) as
// misrepresentation and can get listings disapproved. Brand is emitted
// whenever known; gtin/mpn are only emitted when an admin actually set one.
// identifier_exists=no is only sent for the case Google defines it for: no
// gtin AND no brand+mpn pair — it's omitted whenever a valid identifier
// combination is present, per Google's own feed spec.
const identifierFields = (item, entity, brandName) => {
  if (brandName) item.ele("g:brand").txt(brandName);
  if (entity.gtin) {
    item.ele("g:gtin").txt(entity.gtin);
  } else if (entity.mpn && brandName) {
    item.ele("g:mpn").txt(entity.mpn);
  } else {
    item.ele("g:identifier_exists").txt("no");
  }
};

const cleanDescription = (product) =>
  (product.short_description
    ? product.short_description.replace(/<[^>]+>/g, "")
    : product.name
  ).substring(0, 5000);

export const generateGoogleFeedFile = async () => {
  const products = await Product.find({
    deleted_at: null,
    status: "active",
    exclude_from_feed: { $ne: true },
  })
    .populate("brand", "name")
    .populate("images", "url")
    .lean();

  const variableProductIds = products.filter((p) => p.type === "variable").map((p) => p._id);
  const variationsByProduct = new Map();
  if (variableProductIds.length) {
    const variations = await ProductVariation.find({
      product_id: { $in: variableProductIds },
      deleted_at: null,
      status: "active",
    })
      .populate("images", "url")
      .lean();
    for (const variation of variations) {
      const key = String(variation.product_id);
      if (!variationsByProduct.has(key)) variationsByProduct.set(key, []);
      variationsByProduct.get(key).push(variation);
    }
  }

  const root = create({
    version: "1.0",
    encoding: "UTF-8",
  })
    .ele("rss", {
      version: "2.0",
      "xmlns:g": "http://base.google.com/ns/1.0",
    })
    .ele("channel");

  root.ele("title").txt("Elexify Online").up();
  root.ele("link").txt(envs.FRONTEND_URL).up();
  root.ele("description").txt("Google Merchant Feed").up();

  for (const product of products) {
    const brandName = product.brand?.name || null;
    const productLink = `${envs.FRONTEND_URL.replace(/\/$/, "")}/product/${product.slug}/`;
    const description = cleanDescription(product);
    const parentImage = imageUrl(product.images?.[0]);
    const variations = variationsByProduct.get(String(product._id)) || [];

    if (product.type === "variable" && variations.length) {
      // One <item> per variant, sharing an item_group_id — Google's
      // required shape for size/color/etc. variants — so price and
      // availability are always accurate per SKU instead of only ever
      // reflecting the parent product's (possibly unrelated) stock.
      const groupId = product.sku || product._id.toString();
      for (const variation of variations) {
        const item = root.ele("item");
        const title = variation.combination_display
          ? `${product.name} - ${variation.combination_display}`
          : product.name;
        const { price, salePrice } = priceFields(variation.regular_price, variation.sale_price);

        item.ele("g:id").txt(variation.sku || variation._id.toString());
        item.ele("g:item_group_id").txt(groupId);
        item.ele("g:title").dat(title);
        item.ele("g:description").dat(description);
        item.ele("g:link").dat(productLink);
        const image = imageUrl(variation.images?.[0]) || parentImage;
        if (image) item.ele("g:image_link").txt(image);
        item.ele("g:availability").txt(variation.stock_quantity > 0 ? "in stock" : "out of stock");
        item.ele("g:price").txt(price);
        if (salePrice) item.ele("g:sale_price").txt(salePrice);
        item.ele("g:condition").txt("new");
        if (product.google_product_category) {
          item.ele("g:google_product_category").txt(product.google_product_category);
        }
        identifierFields(item, product, brandName);
        item.up();
      }
      continue;
    }

    const item = root.ele("item");
    const { price, salePrice } = priceFields(product.regular_price, product.sale_price);

    item.ele("g:id").txt(product.sku || product._id.toString());
    item.ele("g:title").dat(product.name);
    item.ele("g:description").dat(description);
    item.ele("g:link").dat(productLink);
    if (parentImage) item.ele("g:image_link").txt(parentImage);
    item.ele("g:availability").txt(product.stock_quantity > 0 ? "in stock" : "out of stock");
    item.ele("g:price").txt(price);
    if (salePrice) item.ele("g:sale_price").txt(salePrice);
    item.ele("g:condition").txt("new");
    if (product.google_product_category) {
      item.ele("g:google_product_category").txt(product.google_product_category);
    }
    identifierFields(item, product, brandName);

    item.up();
  }

  const xml = root.end({ prettyPrint: true });

  const filePath = path.join(
    process.cwd(),
    "public",
    "google-merchant-feed.xml",
  );

  fs.writeFileSync(filePath, xml);

  return true;
};

// Debounced trigger for admin-initiated catalog changes (product
// add/edit/remove/status-update): several edits in quick succession collapse
// into a single regeneration a few seconds later, instead of rebuilding the
// whole feed file synchronously inside every admin request. This runs
// alongside (not instead of) the periodic cron, which is the safety net for
// order-driven stock changes that don't go through these admin endpoints.
const REGENERATION_DEBOUNCE_MS = 15_000;
let pendingRegeneration = null;

export const scheduleGoogleFeedRegeneration = () => {
  if (pendingRegeneration) clearTimeout(pendingRegeneration);
  pendingRegeneration = setTimeout(() => {
    pendingRegeneration = null;
    generateGoogleFeedFile().catch((error) => {
      console.error("Scheduled Google Feed regeneration failed:", error);
    });
  }, REGENERATION_DEBOUNCE_MS);
  // Never let this background timer keep the process alive on its own.
  pendingRegeneration.unref?.();
};
