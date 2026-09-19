// Verified legacy URL -> current catalog slug. Targets are always checked
// against live, active records; never redirect to a guessed product.
export const LEGACY_PRODUCT_SLUGS = {
  'transformer-24-0-24-10-amp-12-0-12-1-amp':
    'transformer-24-0-24-10-amp-12-0-12-1-amp-100-copper-6-month-warranty',
};

export const resolveCatalogSlug = async (Model, slug, aliases = {}) => {
  if (typeof slug !== 'string' || !slug || slug.length > 500) return null;
  const visible = { status: 'active', deleted_at: null };
  const exact = await Model.findOne({ ...visible, slug }).select('_id slug').lean();
  if (exact) return exact;

  const normalized = slug.toLowerCase().replace(/_/g, '-');
  const aliasFor = key => Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key] : null;
  const candidates = [...new Set([slug, normalized, aliasFor(slug), aliasFor(normalized)]
    .filter(value => typeof value === 'string' && value))];
  const matches = await Model.find({ ...visible,
    $or: [{ slug: { $in: candidates } }, { legacy_slugs: { $in: candidates } }],
  }).select('_id slug').limit(2).lean();
  // Ambiguous historical aliases must not send a buyer to the wrong item.
  return matches.length === 1 ? matches[0] : null;
};
