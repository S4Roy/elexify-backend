import Category from "../../models/Category.js";
import Product from "../../models/Product.js";
import Page from "../../models/Page.js";
import Blog from "../../models/Blog.js";
import { StatusError } from "../../config/index.js";

const MODEL_BY_NAME = { categories: Category, products: Product, pages: Page, blogs: Blog };

// Called from add/edit (not just at publish time) so the admin gets an
// immediate 400 if they pick a category/product that doesn't exist or is
// already soft-deleted, instead of discovering it silently dropped at
// publish/resolve time.
export const assertItemReferenceExists = async (referenceModel, referenceId) => {
  if (!referenceModel || !referenceId) return;
  const Model = MODEL_BY_NAME[referenceModel];
  if (!Model) throw StatusError.badRequest(`Unsupported reference model "${referenceModel}"`);

  const doc = await Model.findOne({ _id: referenceId, deleted_at: null }).select("_id").lean();
  if (!doc) {
    throw StatusError.badRequest(`Referenced ${referenceModel.slice(0, -1)} not found`);
  }
};
