import Category from "../../models/Category.js";
import Product from "../../models/Product.js";
import Page from "../../models/Page.js";
import Blog from "../../models/Blog.js";
import Media from "../../models/Media.js";
import MediaResource from "../../resources/MediaResource.js";

const MODEL_BY_NAME = { categories: Category, products: Product, pages: Page, blogs: Blog };
const NAME_FIELD = { categories: "name", products: "name", pages: "title", blogs: "title" };
const IMAGE_FIELD = { categories: "image", products: "images", pages: null, blogs: "feature_image" };
const URL_PREFIX = { categories: "/category", products: "/product", pages: "", blogs: "/blog" };

const LINK_TYPE_TO_MODEL = { category: "categories", product: "products", internal_page: "pages", blog: "blogs" };

const isResolved = (doc) => Boolean(doc) && doc.status !== "inactive" && !doc.deleted_at;

const collectIds = (nodes, refBuckets) => {
  nodes.forEach((node) => {
    if (node.reference_id && node.reference_model) {
      (refBuckets[node.reference_model] ??= new Set()).add(String(node.reference_id));
    }
    if (node.mega_menu_content) {
      (node.mega_menu_content.columns || []).forEach((col) => {
        (col.links || []).forEach((link) => {
          const modelName = LINK_TYPE_TO_MODEL[link.type];
          if (modelName && link.reference_id) {
            (refBuckets[modelName] ??= new Set()).add(String(link.reference_id));
          }
        });
      });
    }
    collectIds(node.children || [], refBuckets);
  });
};

const resolveDoc = (modelName, doc) => {
  if (!isResolved(doc)) return null;
  const nameField = NAME_FIELD[modelName];
  const imageField = IMAGE_FIELD[modelName];
  let imageId = null;
  if (imageField) {
    const raw = doc[imageField];
    imageId = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
  }
  return {
    name: doc[nameField] ?? null,
    slug: doc.slug,
    url: `${URL_PREFIX[modelName]}/${doc.slug}`,
    _imageId: imageId,
  };
};

// Walks a resolved-visibility tree (see resolveVisibleMenuTree) and attaches
// hydrated {name, slug, url, image} data for every reference. A node whose
// own reference can't be resolved (missing/inactive/deleted) is dropped
// along with its subtree — never a cascading delete on the underlying doc,
// just excluded from this read. Individual dead links inside a mega-menu
// column are dropped without taking down the rest of the column.
export const hydrateMenuTree = async (tree = []) => {
  const refBuckets = {};
  collectIds(tree, refBuckets);

  const resolvedMaps = {};
  const imageIds = new Set();

  for (const [modelName, idSet] of Object.entries(refBuckets)) {
    const Model = MODEL_BY_NAME[modelName];
    if (!Model || !idSet.size) continue;
    const selectFields = ["status", "deleted_at", "slug", NAME_FIELD[modelName], IMAGE_FIELD[modelName]]
      .filter(Boolean)
      .join(" ");
    const docs = await Model.find({ _id: { $in: [...idSet] } }).select(selectFields).lean();
    const map = new Map();
    docs.forEach((doc) => {
      const resolved = resolveDoc(modelName, doc);
      if (resolved?._imageId) imageIds.add(String(resolved._imageId));
      map.set(String(doc._id), resolved);
    });
    resolvedMaps[modelName] = map;
  }

  // Second pass for promo tile images, once tree-level nodes are known.
  const collectPromoImageIds = (nodes) => {
    nodes.forEach((node) => {
      if (node.mega_menu_content?.promo?.image) {
        imageIds.add(String(node.mega_menu_content.promo.image));
      }
      collectPromoImageIds(node.children || []);
    });
  };
  collectPromoImageIds(tree);

  let mediaMap = new Map();
  if (imageIds.size) {
    const mediaDocs = await Media.find({ _id: { $in: [...imageIds] } });
    mediaMap = new Map(mediaDocs.map((doc) => [String(doc._id), new MediaResource(doc).exec()]));
  }

  const finalizeResolved = (resolved) => {
    if (!resolved) return null;
    const { _imageId, ...rest } = resolved;
    return { ...rest, image: _imageId ? (mediaMap.get(String(_imageId)) ?? null) : null };
  };

  const hydrateLink = (link) => {
    const modelName = LINK_TYPE_TO_MODEL[link.type];
    if (!modelName) {
      return { ...link, url: link.custom_url ?? "#" };
    }
    const resolved = finalizeResolved(resolvedMaps[modelName]?.get(String(link.reference_id)));
    if (!resolved) return null; // dead link — dropped, doesn't take down the column
    return { ...link, url: resolved.url, resolved_name: resolved.name, image: resolved.image };
  };

  const hydrateMegaMenuContent = (content) => {
    if (!content) return null;
    return {
      layout: content.layout,
      columns: (content.columns || [])
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((col) => ({
          heading: col.heading,
          order: col.order,
          links: (col.links || [])
            .map(hydrateLink)
            .filter(Boolean)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        })),
      promo: content.promo
        ? {
            ...content.promo,
            image: content.promo.image ? (mediaMap.get(String(content.promo.image)) ?? null) : null,
          }
        : null,
    };
  };

  const hydrateNode = (node) => {
    let url = node.custom_url ?? null;
    let resolvedRef = null;

    if (node.reference_id && node.reference_model) {
      const resolved = finalizeResolved(resolvedMaps[node.reference_model]?.get(String(node.reference_id)));
      if (!resolved) return null; // unresolved reference — drop node + subtree
      url = resolved.url;
      resolvedRef = resolved;
    }

    const children = (node.children || []).map(hydrateNode).filter(Boolean);

    return {
      _id: node._id,
      label: node.label,
      type: node.type,
      icon: node.icon,
      badge: node.badge,
      url,
      target: node.target,
      image: resolvedRef?.image ?? null,
      mega_menu_content: hydrateMegaMenuContent(node.mega_menu_content),
      children,
    };
  };

  return tree.map(hydrateNode).filter(Boolean);
};
