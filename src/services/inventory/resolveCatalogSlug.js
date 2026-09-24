// Verified legacy URL -> current catalog slug. Targets are always checked
// against live, active records; never redirect to a guessed product.
export const LEGACY_PRODUCT_SLUGS = {
  'transformer-24-0-24-10-amp-12-0-12-1-amp':
    'transformer-24-0-24-10-amp-12-0-12-1-amp-100-copper-6-month-warranty',
  'transformer-20-0-20-10-amp-100-copper':
    'transformer-20-0-20-10-amp-100-copper-6-month-warranty',
  'ifr-jsk-new-energy-32140-fs-3-2v-15000mah-15ah-lifepo4-rechargeable-battery-3c-grade-a':
    'jsk-new-energy-32140fs-3-2v-15000m-ah-li-fe-po4-rechargeable-battery-3c-grade-a',
};

export const LEGACY_CATEGORY_SLUGS = {
  'amplify-power-supply-boards': 'amplifier-power-supply-boards',
};

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Old WooCommerce slugs kept "lifepo4"/"6000mah" together where current slugs
// split them ("li-fe-po4", "6000m-ah"). Ignoring hyphens matches the same words
// in the same order, so a single hit is the same record, not a guess.
export const hyphenInsensitivePattern = slug => {
  const compact = slug.replace(/-/g, '');
  if (!/^[a-z0-9]{8,}$/.test(compact)) return null;
  return new RegExp(`^${[...compact].join('-*')}$`);
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
  if (matches.length) return matches.length === 1 ? matches[0] : null;

  const pattern = hyphenInsensitivePattern(normalized);
  if (!pattern) return null;
  const spelled = await Model.find({ ...visible, $or: [{ slug: pattern }, { legacy_slugs: pattern }] })
    .select('_id slug').limit(2).lean();
  return spelled.length === 1 ? spelled[0] : null;
};

const STOP_WORDS = new Set(['and', 'for', 'the', 'with', 'of', 'pack', 'new']);

// "Did you mean" candidates for a slug that did not resolve: live records whose
// names share the most words with it. Shown as links, never redirected to.
export const suggestCatalog = async (Model, slug, limit = 6) => {
  if (typeof slug !== 'string' || !slug || slug.length > 500) return [];
  const words = [...new Set(slug.toLowerCase().replace(/_/g, '-').split('-')
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word)))].slice(0, 10);
  if (!words.length) return [];
  const candidates = await Model.find({ status: 'active', deleted_at: null,
    $or: words.map(word => ({ name: new RegExp(escapeRegex(word), 'i') })),
  }).select('name slug').limit(200).lean();
  const score = name => {
    const compact = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return words.filter(word => compact.includes(word)).length;
  };
  return candidates.map(record => ({ name: record.name, slug: record.slug, score: score(record.name) }))
    .filter(record => record.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, slug: recordSlug }) => ({ name, slug: recordSlug }));
};
