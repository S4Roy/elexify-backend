// Provider-independent façade over SEO content generation. "template" and
// "rule" both use the deterministic template-fill path below; "ai" is a stub
// so a real provider can be wired in later without touching any other caller.
import { generateMetaTitle } from "../generateMetaTitle.js";
import { generateMetaDescription } from "../generateMetaDescription.js";

export class NotConfiguredError extends Error {}

export const SeoContentGenerator = {
  generate({ mode = "template", variables, settings, focusKeyword }) {
    if (mode === "ai") {
      throw new NotConfiguredError("AI-assisted SEO generation is not configured.");
    }

    const title = generateMetaTitle({
      template: settings.product_title_template,
      variables,
      focusKeyword,
      maxLength: settings.title_max_length,
    });
    const description = generateMetaDescription({
      template: settings.product_description_template,
      variables,
      focusKeyword,
      maxLength: settings.description_max_length,
    });

    return { title, description };
  },
};
