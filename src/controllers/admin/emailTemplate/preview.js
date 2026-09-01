import EmailTemplate from "../../../models/EmailTemplate.js";
import { StatusError } from "../../../config/index.js";
import { renderEmailTemplate } from "../../../services/email/renderEmailTemplate.js";
import { renderEmailShell } from "../../../services/email/emailLayout.js";
import { htmlToText } from "../../../services/email/htmlToText.js";
import { emailBrand } from "../../../config/emailBrand.js";
import { EMAIL_PREVIEW_FIXTURE } from "../../../constants/emailPreviewFixture.js";

// Renders (never sends) a template with safe sample fixture data — the
// admin editor's live preview. Renders the CURRENT unsaved form content
// when `subject`/`preheader`/`body` are passed in the body (so "preview
// before save" works), otherwise the persisted row.
export const preview = async (req, res, next) => {
  try {
    const { action } = req.params;
    const template = await EmailTemplate.findOne({ action, site_language: "en" }).lean();
    if (!template) throw StatusError.notFound(req.__("Email template not found"));

    const draft = {
      subject: req.body?.subject ?? template.subject,
      preheader: req.body?.preheader ?? template.preheader,
      body: req.body?.body ?? template.body,
      required_variables: template.required_variables,
    };

    const rendered = renderEmailTemplate(draft, EMAIL_PREVIEW_FIXTURE);
    const html = renderEmailShell({
      subject: rendered.subject,
      preheaderText: rendered.preheader,
      brand: emailBrand,
      contentHtml: rendered.body,
      showPreferencesLink: Boolean(template.is_marketing),
    });

    res.status(200).json({
      status: "success",
      message: req.__("Preview rendered successfully"),
      data: {
        subject: rendered.subject,
        preheader: rendered.preheader,
        html,
        text: htmlToText(rendered.body),
        missingVariables: rendered.missingVariables,
        unresolvedFields: rendered.unresolvedFields,
      },
    });
  } catch (error) {
    next(error);
  }
};
