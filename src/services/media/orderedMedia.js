// MongoDB's $lookup does not return foreign documents in the order of the local
// id array, so product galleries came back in upload order no matter how the
// admin arranged them. These keep the order of the stored id array.

/** Stages for a medias $lookup pipeline that sort results by position in `idsExpr`. */
export const keepOrderOf = (idsExpr) => [
  { $addFields: { __media_order: { $indexOfArray: [{ $ifNull: [idsExpr, []] }, "$_id"] } } },
  { $sort: { __media_order: 1 } },
  { $project: { __media_order: 0 } },
];

/** Drop-in for `{ $lookup: { from: "medias", localField, foreignField: "_id", as } }` that keeps array order. */
export const orderedMediaLookup = ({ localField, as }) => ({
  $lookup: {
    from: "medias",
    localField,
    foreignField: "_id",
    let: { mediaIds: `$${localField}` },
    pipeline: keepOrderOf("$$mediaIds"),
    as,
  },
});

/**
 * Media ids in the order the admin arranged them, keeping only ids that exist.
 * (`Media.find({ _id: { $in } })` returns database order, which lost the arrangement.)
 */
export const inRequestedOrder = (requestedIds, foundDocs) => {
  const found = new Set(foundDocs.map((doc) => String(doc._id)));
  const seen = new Set();
  return requestedIds.filter((id) => {
    const key = String(id);
    if (!found.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
