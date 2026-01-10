import Handlebars from "handlebars";
import nodemailer from "nodemailer";
import smtpTransport from "nodemailer-smtp-transport";
import { emailTemplateService } from "../index.js";
import { envs } from "../../config/index.js";
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

    // Compile the template using Handlebars
    const template = Handlebars.compile(emailTemplate.content);
    const content = template(mergedSubstitutions, {
      data: {
        intl: {
          locales: "en-US",
        },
      },
    });

    // Configure SMTP transport
    const transporter = nodemailer.createTransport(
      smtpTransport({
        host: envs.smtp.host,
        port: envs.smtp.port,
        secure: envs.smtp.secure,
        auth: {
          user: envs.smtp.email,
          pass: envs.smtp.password,
        },
      })
    );

    // Mail details
    const mailOptions = {
      from: {
        name: envs.PROJECT_NAME || "No-Reply",
        address: envs.smtp.fromEmail,
      },
      to: email,
      subject: subject || emailTemplate.subject,
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
