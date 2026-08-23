// Pure function — expects plain JS objects (call `.toObject()`/`.lean()`
// before passing Mongoose data in). Used identically by the public endpoint
// (against `published_sections`) and the admin preview endpoint (against the
// draft `sections`) so "what preview shows" and "what publish will actually
// serve" can never drift apart.
const isWithinSchedule = (schedule, now) => {
  if (!schedule) return true;
  const { startAt, endAt } = schedule;
  if (startAt && now < new Date(startAt)) return false;
  if (endAt && now > new Date(endAt)) return false;
  return true;
};

export const resolveVisibleSections = (sections = [], { now = new Date() } = {}) => {
  return (sections || [])
    .filter((section) => section.enabled && isWithinSchedule(section.schedule, now))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((section) => {
      if (section.type !== "hero") return section;
      const slides = (section.config?.slides || [])
        .filter((slide) => slide.enabled !== false && isWithinSchedule(slide.schedule, now))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return { ...section, config: { ...section.config, slides } };
    });
};
