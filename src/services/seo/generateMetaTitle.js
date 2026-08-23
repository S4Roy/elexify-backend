import { renderTemplate } from "./renderTemplate.js";
import { truncateAtWord } from "./textUtils.js";

// Collapses "|"-delimited segments: drops empty segments (missing variables)
// and case-insensitive duplicate segments (e.g. brand === category), without
// touching within-segment wording — the example "5 Mukhi Rudraksha Mala |
// Original Rudraksha | Elexify" must keep "Rudraksha" in both segments.
const collapseSegments = (rendered) => {
  const seen = new Set();
  return rendered
    .split("|")
    .map((segment) => segment.trim())
    .filter((segment) => {
      if (!segment) return false;
      const key = segment.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" | ");
};

export const generateMetaTitle = ({ template, variables, focusKeyword, maxLength = 60 }) => {
  let title = collapseSegments(renderTemplate(template, variables));

  const keyword = (focusKeyword || "").trim();
  if (keyword && !title.toLowerCase().includes(keyword.toLowerCase())) {
    title = title ? `${keyword} | ${title}` : keyword;
  }

  title = truncateAtWord(title, maxLength);
  // Truncation can land right after a "|" separator, leaving a dangling
  // trailing pipe with nothing after it — strip that debris rather than
  // shipping a meaningless half-finished segment.
  return title.replace(/\s*\|\s*$/, "").trim();
};
