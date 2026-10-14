import mongoose from "mongoose";
import SearchSynonym from "../../../models/SearchSynonym.js";
import { StatusError } from "../../../config/index.js";
import { invalidateSynonyms, parseSynonym } from "../../../services/search/synonyms.js";
import { normalizeQuery } from "../../../services/searchInsights/actions.js";

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
