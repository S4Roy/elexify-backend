import { resolveEmailBrand } from './resolveEmailBrand.js';
import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { envs } from '../../config/envs.js';
import { getIntegrationConfig } from '../integrationCredentials/index.js';
import { renderEmailShell } from './emailLayout.js';

export const ticketReference = id => `CON-${String(id).toUpperCase()}`;

export async function sendContactReply(contact, message, previous = []) {
  const config = await getIntegrationConfig('smtp', envs.smtp);
  if (!config) {
    const error = new Error('Email sending is disabled.');
    error.definitelyNotSent = true;
    throw error;
  }
  const brand = await resolveEmailBrand();
  const subject = `Re: [${ticketReference(contact._id)}] ${(contact.subject || 'Your enquiry').replace(/[\r\n]/g, ' ')}`;
  const escape = Handlebars.escapeExpression;
  // Only this reply is sent. Internal remarks and activity never enter the email.
  const contentHtml = `<p>Hello ${escape(contact.name || 'there')},</p><div style="white-space:pre-wrap;line-height:1.7">${escape(message.content)}</div><p>Regards,<br>${escape(brand.brandName)} Support</p><p style="font-size:12px;color:#52606d">Reference: ${ticketReference(contact._id)}</p>`;
  const references = previous.filter(Boolean);
  const transport = nodemailer.createTransport({
    host: config.host, port: Number(config.port) || 465,
    secure: String(config.secure) !== 'false',
    auth: { user: config.email, pass: config.password },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  try {
    const info = await transport.sendMail({
      from: { name: `${brand.brandName} Support`, address: config.fromEmail || config.email },
      to: { name: contact.name || '', address: contact.email },
      replyTo: brand.supportEmail,
      subject, messageId: message.message_id,
      ...(references.length && { inReplyTo: references[references.length - 1], references }),
      text: `Hello ${contact.name || 'there'},\n\n${message.content}\n\nRegards,\n${brand.brandName} Support\nReference: ${ticketReference(contact._id)}`,
      html: renderEmailShell({ subject, preheaderText: 'A response to your enquiry', brand, contentHtml }),
      disableFileAccess: true, disableUrlAccess: true,
    });
    if (!info.accepted?.length) {
      const error = new Error('Recipient was not accepted.');
      error.definitelyNotSent = true;
      throw error;
    }
    return info;
  } finally { transport.close(); }
}
