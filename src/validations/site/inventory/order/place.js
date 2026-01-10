import { celebrate, Joi } from "celebrate";

export const place = celebrate({
  body: Joi.object({
    currency: Joi.string().optional().allow("", null),

    shipping_address: Joi.object({
      first_name: Joi.string().min(2).max(100).required().messages({
        "string.base": "First name must be a string",
        "string.empty": "First name is required",
        "string.min": "First name must be at least 2 characters",
        "string.max": "First name cannot exceed 100 characters",
        "any.required": "First name is required",
      }),

      last_name: Joi.string().min(2).max(100).required().messages({
        "string.base": "Last name must be a string",
        "string.empty": "Last name is required",
        "string.min": "Last name must be at least 2 characters",
        "string.max": "Last name cannot exceed 100 characters",
        "any.required": "Last name is required",
      }),
      phone_code: Joi.string()
        .pattern(/^\d{1,4}$/)
        .required()
        .messages({
          "string.pattern.base":
            "Phone code must be in the format <phone_code> (e.g., 91)",
          "string.empty": "Phone code is required",
          "any.required": "Phone code is required",
        }),
      phone: Joi.string()
        .pattern(/^[6-9]\d{9}$/)
        .required()
        .messages({
          "string.pattern.base":
            "Phone number must be a valid 10-digit Indian mobile number",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),

      email: Joi.string().email().optional().allow(null, "").messages({
        "string.email": "Email must be a valid email address",
      }),

      address_line_1: Joi.string().min(5).max(200).required().messages({
        "string.base": "Address Line 1 must be a string",
        "string.empty": "Address Line 1 is required",
        "string.min": "Address Line 1 must be at least 5 characters",
        "string.max": "Address Line 1 cannot exceed 200 characters",
        "any.required": "Address Line 1 is required",
      }),

      address_line_2: Joi.string()
        .max(200)
        .optional()
        .allow(null, "")
        .messages({
          "string.max": "Address Line 2 cannot exceed 200 characters",
        }),

      land_mark: Joi.string().max(100).optional().allow(null, "").messages({
        "string.max": "Landmark cannot exceed 100 characters",
      }),

      city: Joi.number().required().messages({
        "number.base": "City must be a ID",
        "number.empty": "City is required",
        "any.required": "City is required",
      }),

      state: Joi.number().required().messages({
        "number.base": "State must be a ID",
        "number.empty": "State is required",
        "any.required": "State is required",
      }),

      country: Joi.number().default(101).messages({
        "number.base": "Country must be a ID",
      }),

      postcode: Joi.string().required().messages({
        "string.base": "Postcode must be a string",
        "string.empty": "Postcode is required",
        "any.required": "Postcode is required",
      }),
    }).required(),
    billing_address: Joi.object({
      first_name: Joi.string().min(2).max(100).required().messages({
        "string.base": "First name must be a string",
        "string.empty": "First name is required",
        "string.min": "First name must be at least 2 characters",
        "string.max": "First name cannot exceed 100 characters",
        "any.required": "First name is required",
      }),

      last_name: Joi.string().min(2).max(100).required().messages({
        "string.base": "Last name must be a string",
        "string.empty": "Last name is required",
        "string.min": "Last name must be at least 2 characters",
        "string.max": "Last name cannot exceed 100 characters",
        "any.required": "Last name is required",
      }),
      phone_code: Joi.string()
        .pattern(/^\d{1,4}$/)
        .required()
        .messages({
          "string.pattern.base":
            "Phone code must be in the format <phone_code> (e.g., 91)",
          "string.empty": "Phone code is required",
          "any.required": "Phone code is required",
        }),
      phone: Joi.string()
        .pattern(/^[6-9]\d{9}$/)
        .required()
        .messages({
          "string.pattern.base":
            "Phone number must be a valid 10-digit Indian mobile number",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),

      email: Joi.string().email().optional().allow(null, "").messages({
        "string.email": "Email must be a valid email address",
      }),

      address_line_1: Joi.string().min(5).max(200).required().messages({
        "string.base": "Address Line 1 must be a string",
        "string.empty": "Address Line 1 is required",
        "string.min": "Address Line 1 must be at least 5 characters",
        "string.max": "Address Line 1 cannot exceed 200 characters",
        "any.required": "Address Line 1 is required",
      }),

      address_line_2: Joi.string()
        .max(200)
        .optional()
        .allow(null, "")
        .messages({
          "string.max": "Address Line 2 cannot exceed 200 characters",
        }),

      land_mark: Joi.string().max(100).optional().allow(null, "").messages({
        "string.max": "Landmark cannot exceed 100 characters",
      }),

      city: Joi.number().required().messages({
        "number.base": "City must be a ID",
        "number.empty": "City is required",
        "any.required": "City is required",
      }),

      state: Joi.number().required().messages({
        "number.base": "State must be a ID",
        "number.empty": "State is required",
        "any.required": "State is required",
      }),

      country: Joi.number().default(101).messages({
        "number.base": "Country must be a ID",
      }),

      postcode: Joi.string().required().messages({
        "string.base": "Postcode must be a string",
        "string.empty": "Postcode is required",
        "any.required": "Postcode is required",
      }),
    }).optional(),

    payment_method: Joi.string()
      .valid("paypal", "razorpay")
      .required()
      .messages({
        "any.only": "Payment method must be either 'paypal' or 'razorpay'",
        "string.empty": "Payment method is required",
      }),

    note: Joi.string().max(500).optional().allow("").messages({
      "string.max": "Note cannot exceed 500 characters",
    }),
    isDirectCheckout: Joi.boolean().optional().default(false),
    coupon_code: Joi.string().optional().allow("", null),
  }),
});
