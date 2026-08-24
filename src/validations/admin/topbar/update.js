import { celebrate, Joi } from "celebrate";

const scheduleSchema = Joi.object({
  startAt: Joi.date().allow(null),
  endAt: Joi.date().allow(null),
}).allow(null);

const announcementSchema = Joi.object({
  // Echoed back by GET since AnnouncementSchema has `timestamps: true` —
  // accepted (and ignored on write) so an unmodified edit-and-save round
  // trip doesn't fail validation on its own read-only fields.
  _id: Joi.string().optional(),
  createdAt: Joi.date().optional(),
  updatedAt: Joi.date().optional(),
  message: Joi.string().required().messages({
    "string.empty": "Announcement message is required",
    "any.required": "Announcement message is required",
  }),
  icon: Joi.string().allow("", null).optional(),
  link: Joi.string().allow("", null).optional(),
  target: Joi.string().valid("_self", "_blank").optional(),
  desktop_content: Joi.string().allow("", null).optional(),
  mobile_content: Joi.string().allow("", null).optional(),
  dismissible: Joi.boolean().optional(),
  order: Joi.number().integer().optional(),
  enabled: Joi.boolean().optional(),
  schedule: scheduleSchema.optional(),
});

const contactItemSchema = Joi.object({
  icon: Joi.string().allow("", null).optional(),
  label: Joi.string().required().messages({
    "string.empty": "Contact item label is required",
    "any.required": "Contact item label is required",
  }),
  link: Joi.string().allow("", null).optional(),
  order: Joi.number().integer().optional(),
  enabled: Joi.boolean().optional(),
});

export const update = celebrate({
  body: Joi.object({
    announcements: Joi.array().items(announcementSchema).optional(),
    contact_items: Joi.array().items(contactItemSchema).optional(),
  }),
});
