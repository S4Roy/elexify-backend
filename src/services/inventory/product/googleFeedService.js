import fs from "fs";
import path from "path";
import { create } from "xmlbuilder2";
import Product from "../../../models/Product.js";
import { envs } from "../../../config/index.js";

export const generateGoogleFeedFile = async () => {
  const products = await Product.find({
    deleted_at: null,
    status: "active",
  }).lean();

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
    const item = root.ele("item");

    const cleanDescription = product.short_description
      ? product.short_description.replace(/<[^>]+>/g, "").substring(0, 5000)
      : product.name;

    const productLink = `${envs.FRONTEND_URL}/product/${product.slug}`;

    item.ele("g:id").txt(product.sku || product._id.toString());
    item.ele("g:title").dat(product.name);
    item.ele("g:description").dat(cleanDescription);
    item.ele("g:link").dat(productLink);

    item
      .ele("g:availability")
      .txt(product.stock_quantity > 0 ? "in stock" : "out of stock");

    item
      .ele("g:price")
      .txt(`${Number(product.regular_price || 0).toFixed(2)} INR`);

    item.ele("g:condition").txt("new");
    item.ele("g:mpn").txt(product.sku || product._id.toString());
    item.ele("g:identifier_exists").txt("yes");

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
