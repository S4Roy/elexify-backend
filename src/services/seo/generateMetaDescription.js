import { renderTemplate } from "./renderTemplate.js";
import { truncateAtWord, collapseWhitespace } from "./textUtils.js";

export const generateMetaDescription = ({ template, variables, focusKeyword, maxLength = 160 }) => {
  let description = collapseWhitespace(renderTemplate(template, variables));

  const keyword = (focusKeyword || "").trim();
  if (keyword && !description.toLowerCase().includes(keyword.toLowerCase())) {
    description = description ? `${keyword}. ${description}` : keyword;
  }

  return truncateAtWord(description, maxLength);
};
