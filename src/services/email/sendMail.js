import nodemailer from "nodemailer";
import { emailTemplateService } from "../index.js";
import { envs } from "../../config/index.js";
import { renderEmailTemplate } from "./renderEmailTemplate.js";
import path from "path";

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

    // Default substitution values
    const defaultSubstitutions = {
      logo_url: envs.BACKEND_URL + "/public/images/logo/logo.png",
      privacy_url: envs.FRONTEND_URL + "/page/privacy-policy",
      unsubscribe_url: envs.BACKEND_URL + "/unsubscribe",
      company_name: envs.PROJECT_NAME || "Your Company",
      support_email: envs.smtp.fromEmail || "support@example.com",
      year: new Date().getFullYear(),
    };

    // Merge user-provided substitutions with default values
    const mergedSubstitutions = { ...defaultSubstitutions, ...substitutions };

    // Render subject and body through the same Handlebars pass — a
    // caller-supplied `subject` overrides the template's own subject, but
    // either way it goes through the renderer, never sent raw.
    const rendered = renderEmailTemplate(
      { subject: subject || emailTemplate.subject, body: emailTemplate.body },
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

    const content = rendered.body;

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
        name: envs.PROJECT_NAME || "No-Reply",
        address: envs.smtp.fromEmail,
      },
      to: email,
      subject: rendered.subject,
      html: content,
      // attachments: [
      //   {
      //     filename: "logo.svg",
      //     path: path.resolve("public/images/logo", "logo.svg"),
      //     cid: "logoImage",
      //   },
      // ],
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
