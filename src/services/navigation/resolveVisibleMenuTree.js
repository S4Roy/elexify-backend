// Tree-shaped analogue of homepage/resolveVisibleSections.js. Pure function —
// expects plain JS objects (call `.lean()` before passing Mongoose data in).
// Used identically by the admin preview endpoint (source:"draft", against the
// live fields) and the public site endpoint (source:"published", against
// each item's `published_snapshot`) so "what preview shows" and "what
// publish will actually serve" can never drift apart.
const isWithinSchedule = (schedule, now) => {
  if (!schedule) return true;
  const { startAt, endAt } = schedule;
  if (startAt && now < new Date(startAt)) return false;
  if (endAt && now > new Date(endAt)) return false;
  return true;
};

const fieldsForSource = (item, source) => {
  if (source === "published") {
    const snap = item.published_snapshot || {};
    return {
      _id: item._id,
      label: snap.label ?? null,
      type: snap.type ?? null,
      icon: snap.icon ?? null,
      badge: snap.badge ?? null,
      reference_id: snap.reference_id ?? null,
      reference_model: snap.reference_model ?? null,
      custom_url: snap.custom_url ?? null,
      target: snap.target ?? "_self",
      order: snap.order ?? 0,
      enabled: snap.enabled !== false,
      schedule: snap.schedule ?? null,
      mega_menu_content: snap.mega_menu_content ?? null,
      parent_id: snap.parent_id ?? null,
    };
  }
  return {
    _id: item._id,
    label: item.label ?? null,
    type: item.type ?? null,
    icon: item.icon ?? null,
    badge: item.badge ?? null,
    reference_id: item.reference_id ?? null,
    reference_model: item.reference_model ?? null,
    custom_url: item.custom_url ?? null,
    target: item.target ?? "_self",
    order: item.order ?? 0,
    enabled: item.enabled !== false,
    schedule: item.schedule ?? null,
    mega_menu_content: item.mega_menu_content ?? null,
    parent_id: item.parent_id ?? null,
  };
};

// Cascades on purpose: a node that fails the enabled/schedule check is
// excluded before we ever look up its children bucket, so its entire
// subtree (including nested mega-menu column links) disappears with it —
// no separate "orphan" handling needed.
export const resolveVisibleMenuTree = (rawItems = [], { source = "draft", now = new Date() } = {}) => {
  const pool = source === "published" ? rawItems.filter((i) => i.is_published) : rawItems;
  const items = pool.map((item) => fieldsForSource(item, source));

  const byParent = new Map();
  items.forEach((item) => {
    const key = item.parent_id ? String(item.parent_id) : "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(item);
  });

  const visit = (parentKey) =>
    (byParent.get(parentKey) || [])
      .filter((item) => item.enabled && isWithinSchedule(item.schedule, now))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item) => ({ ...item, children: visit(String(item._id)) }));

  return visit("root");
};
