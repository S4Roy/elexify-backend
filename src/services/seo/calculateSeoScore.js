// Internal SEO quality score (0-100) — explicitly NOT a Google ranking
// signal, just a checklist-driven completeness/quality indicator.
const withinRange = (len, min, max) => len >= min && len <= max;

export const calculateSeoScore = (
  product,
  seo,
  { isDuplicateTitle = false, isDuplicateDescription = false, imageAlt = null, settings = null } = {},
) => {
  const titleMin = settings?.title_min_length ?? 50;
  const titleMax = settings?.title_max_length ?? 60;
  const descMin = settings?.description_min_length ?? 140;
  const descMax = settings?.description_max_length ?? 160;

  const title = (seo?.meta_title || "").trim();
  const description = (seo?.meta_description || "").trim();
  const keyword = (seo?.focus_keyword || "").trim().toLowerCase();
  const productName = (product?.name || "").trim().toLowerCase();
  const firstWord = productName.split(" ")[0] || "";
  const slug = product?.slug || "";

  const checks = [
    { id: "title_exists", label: "Meta title exists", weight: 10, pass: !!title },
    {
      id: "title_length_optimal",
      label: `Meta title length (${titleMin}-${titleMax} chars)`,
      weight: 8,
      pass: !!title && withinRange(title.length, titleMin, titleMax),
    },
    {
      id: "keyword_in_title",
      label: "Focus keyword present in title",
      weight: 8,
      pass: !keyword || title.toLowerCase().includes(keyword),
    },
    {
      id: "keyword_near_start",
      label: "Focus keyword near the beginning of the title",
      weight: 6,
      pass: (() => {
        if (!keyword) return true;
        const position = title.toLowerCase().indexOf(keyword);
        return position !== -1 && position <= Math.min(20, title.length);
      })(),
    },
    { id: "description_exists", label: "Meta description exists", weight: 10, pass: !!description },
    {
      id: "description_length_optimal",
      label: `Meta description length (${descMin}-${descMax} chars)`,
      weight: 8,
      pass: !!description && withinRange(description.length, descMin, descMax),
    },
    {
      id: "keyword_in_description",
      label: "Focus keyword present in description",
      weight: 8,
      pass: !keyword || description.toLowerCase().includes(keyword),
    },
    {
      id: "product_name_relevance",
      label: "Product name reflected in title",
      weight: 6,
      pass: !firstWord || title.toLowerCase().includes(firstWord),
    },
    {
      id: "slug_quality",
      label: "URL slug is clean and reasonably short",
      weight: 6,
      pass: !!slug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 75,
    },
    { id: "no_duplicate_title", label: "Meta title is unique across products", weight: 8, pass: !isDuplicateTitle },
    {
      id: "no_duplicate_description",
      label: "Meta description is unique across products",
      weight: 7,
      pass: !isDuplicateDescription,
    },
    { id: "canonical_present", label: "Canonical URL set", weight: 5, pass: !!seo?.canonical_url },
    { id: "image_alt_text", label: "Primary image has alt text", weight: 5, pass: !!imageAlt },
    {
      id: "schema_enabled",
      label: "Structured data enabled",
      weight: 3,
      // Model defaults this to true; .lean() reads don't backfill defaults
      // for fields never explicitly stored, so only an explicit false fails.
      pass: seo?.schema_enabled !== false,
    },
    {
      id: "og_present",
      label: "Open Graph title/description set",
      weight: 2,
      pass: !!(seo?.og_title && seo?.og_description),
    },
  ];

  const score = checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0);
  const status = score >= 80 ? "Good" : score >= 50 ? "Needs Improvement" : "Poor";

  return {
    score,
    max_score: 100,
    status,
    is_internal_quality_score: true,
    checks: checks.map(({ id, label, pass, weight }) => ({ id, label, pass, weight })),
  };
};
