import ContactUs from "../../../models/ContactUs.js";
import { StatusError } from "../../../config/index.js";
/**
 * Add ContactUs (allow guest)
 * @param req
 * @param res
 * @param next
 */
export const submit = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      subject,
      message,
      source = "web",
      attachments = [],
      captchaToken,
    } = req.body;
    const doc = new ContactUs({
      name,
      email: email || undefined,
      phone: phone || undefined,
      subject: subject || undefined,
      message,
      source,
      ip: req?.ip || null,
      user_agent: req.get("User-Agent") || null,
      created_by: req.auth?.user_id ?? null,
    });

    await doc.save();

    res.status(201).json({
      status: "success",
      message: req.__("Submitted successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
