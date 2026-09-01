import nodemailer from "nodemailer";
import { emailTemplateService } from "../index.js";
import { envs } from "../../config/index.js";
import { emailBrand } from "../../config/emailBrand.js";
import { renderEmailTemplate } from "./renderEmailTemplate.js";
import { renderEmailShell } from "./emailLayout.js";
import { htmlToText } from "./htmlToText.js";

export const sendEmail = async (
  email,
  type,
  subject,
  language,
  substitutions = {}
) => {
  try {
    console.log("📧 Email Service Called...");

    if (!email || !type) {
      throw new Error("Email and type are required parameters.");
    }

    language = language || envs.DEFAULT_LANGUAGE;

    // Fetch email template
    const emailTemplate = await emailTemplateService.getTemplate(
      type,
      language
    );

    if (!emailTemplate) {
      console.error(
        `❌ No email template found for type: ${type}, language: ${language}`
      );
      return false;
    }

    // Default substitution values, available to every template body as
    // flat vars (e.g. "contact {{support_email}}") in addition to the
    // structured `brand` object the shared shell/components consume.
    const defaultSubstitutions = {
      logo_url: emailBrand.logoUrl,
      privacy_url: emailBrand.privacyUrl,
      company_name: emailBrand.brandName,
      support_email: emailBrand.supportEmail,
      account_url: emailBrand.accountUrl,
      storefront_url: emailBrand.storefrontUrl,
      year: new Date().getFullYear(),
    };

    // Merge user-provided substitutions with default values
    const mergedSubstitutions = { ...defaultSubstitutions, ...substitutions };

    // Render subject/preheader/body through the same Handlebars pass — a
    // caller-supplied `subject` overrides the template's own subject, but
    // either way it goes through the renderer, never sent raw.
    const rendered = renderEmailTemplate(
      {
        subject: subject || emailTemplate.subject,
        preheader: emailTemplate.preheader,
        body: emailTemplate.body,
        required_variables: emailTemplate.required_variables,
      },
      mergedSubstitutions
    );

    if (rendered.missingVariables.length > 0 || rendered.unresolvedFields.length > 0) {
      // Never log the substitution values themselves (e.g. otp) — only the
      // variable names and which field(s) failed to resolve.
      console.error(
        `❌ TEMPLATE_RENDER_ERROR type=${type} language=${language} missingVariables=[${rendered.missingVariables.join(", ")}] unresolvedFields=[${rendered.unresolvedFields.join(", ")}]`
      );
      return false;
    }

    const html = renderEmailShell({
      subject: rendered.subject,
      preheaderText: rendered.preheader,
      brand: emailBrand,
      contentHtml: rendered.body,
      showPreferencesLink: Boolean(emailTemplate.is_marketing),
    });
    const text = `${htmlToText(rendered.body)}\n\n--\n${emailBrand.brandName}\nNeed help? ${emailBrand.supportEmail}\nMy Account: ${emailBrand.accountUrl}\nOrders: ${emailBrand.ordersUrl}`;

    // Configure SMTP transport — nodemailer has had SMTP support built in
    // since v6; the separate nodemailer-smtp-transport package (a
    // nodemailer@2.x-era plugin, itself the root of several critical
    // advisories via its own smtp-connection/httpntlm/underscore chain) is
    // no longer needed or installed.
    const transporter = nodemailer.createTransport({
      host: envs.smtp.host,
      port: envs.smtp.port,
      secure: envs.smtp.secure,
      auth: {
        user: envs.smtp.email,
        pass: envs.smtp.password,
      },
    });

    // Mail details
    const mailOptions = {
      from: {
        name: emailBrand.brandName,
        address: envs.smtp.fromEmail,
      },
      to: email,
      subject: rendered.subject,
      html,
      text,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Mail Sent Successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Email Sending Error:", error.message);
    return false;
  }
};
