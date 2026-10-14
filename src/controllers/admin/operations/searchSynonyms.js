import mongoose from "mongoose";
import SearchSynonym from "../../../models/SearchSynonym.js";
import { StatusError } from "../../../config/index.js";
import { invalidateSynonyms, parseSynonym } from "../../../services/search/synonyms.js";
import { suggestAlternatives } from "../../../services/search/suggest.js";
import { normalizeQuery } from "../../../services/searchInsights/actions.js";
import { list as storefrontList } from "../../site/inventory/product/list.js";

const MAX_PREVIEW_TERMS = 11;

// Counts storefront results for one search as a guest shopper would see them.
// `exact` skips the typo fallback, for checking whether a word itself matches.
function storefrontCount(term, exact) {
  return new Promise((resolve, reject) => {
    const req = { query: { search_key: term, page: 1, limit: 1, ...(exact ? { exact: "true" } : {}) }, params: {}, auth: null, __: text => text, skipSearchRecording: true };
    const res = { status() { return this; }, json(body) { resolve(body?.data?.totalDocs ?? 0); } };
    storefrontList(req, res, reject).catch(reject);
  });
}

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validId = id => {
  if (!mongoose.isValidObjectId(id)) throw StatusError.notFound("Synonym not found");
  return id;
};

export const list = async (req, res, next) => {
  try {
    const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const q = normalizeQuery(req.query.q).slice(0, 100);
    const filter = q ? { $or: [{ term: { $regex: escapeRegex(q) } }, { alternatives: { $regex: escapeRegex(q) } }] } : {};
    const [docs, totalDocs] = await Promise.all([
      SearchSynonym.find(filter).sort({ term: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      SearchSynonym.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", data: {
      docs, totalDocs, page, limit, totalPages: Math.ceil(totalDocs / limit),
      hasNextPage: page * limit < totalDocs, hasPrevPage: page > 1,
    } });
  } catch (error) { next(error); }
};

// Lets the insights editor open an existing rule for a query instead of creating a duplicate.
export const findByTerm = async (req, res, next) => {
  try {
    const term = normalizeQuery(req.query.term);
    const doc = term ? await SearchSynonym.findOne({ term }).lean() : null;
    res.status(200).json({ status: "success", data: doc });
  } catch (error) { next(error); }
};

// Live counts for the synonym editor, so admins can see whether each alternative finds anything.
export const preview = async (req, res, next) => {
  try {
    const raw = Array.isArray(req.body?.terms) ? req.body.terms : [];
    const terms = [...new Set(raw.map(normalizeQuery))].filter(term => term && term.length <= 100);
    if (terms.length > MAX_PREVIEW_TERMS) throw StatusError.badRequest(`At most ${MAX_PREVIEW_TERMS} terms`);
    const exact = req.body?.exact === true;
    const counts = await Promise.all(terms.map(async term => ({ term, count: await storefrontCount(term, exact) })));
    res.status(200).json({ status: "success", data: counts });
  } catch (error) { next(error); }
};

export const suggest = async (req, res, next) => {
  try {
    res.status(200).json({ status: "success", data: await suggestAlternatives(req.query.term) });
  } catch (error) { next(error); }
};

const save = async (id, body) => {
  const parsed = parseSynonym(body);
  if (parsed.error) throw StatusError.badRequest(parsed.error);
  try {
    const doc = id
      ? await SearchSynonym.findByIdAndUpdate(id, { $set: { ...parsed, updated_at: new Date() } }, { new: true, runValidators: true })
      : await SearchSynonym.create(parsed);
    if (!doc) throw StatusError.notFound("Synonym not found");
    invalidateSynonyms();
    return doc;
  } catch (error) {
    if (error.code === 11000) throw StatusError.conflict(`A synonym for "${parsed.term}" already exists`);
    throw error;
  }
};

export const create = async (req, res, next) => {
  try {
    res.status(201).json({ status: "success", message: "Synonym added", data: await save(null, req.body) });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    res.status(200).json({ status: "success", message: "Synonym updated", data: await save(validId(req.params.id), req.body) });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    const doc = await SearchSynonym.findByIdAndDelete(validId(req.params.id));
    if (!doc) throw StatusError.notFound("Synonym not found");
    invalidateSynonyms();
    res.status(200).json({ status: "success", message: "Synonym deleted" });
  } catch (error) { next(error); }
};
