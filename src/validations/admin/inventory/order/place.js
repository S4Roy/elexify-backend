import { celebrate, Joi } from "celebrate";

export const place = celebrate({
  body: Joi.object({
    first_name: Joi.string().min(2).max(100).required().messages({
      "string.empty": "First name is required",
      "string.min": "First name must be at least 2 characters",
      "string.max": "First name cannot exceed 100 characters",
    }),
    last_name: Joi.string().min(2).max(100).required().messages({
      "string.empty": "Last name is required",
      "string.min": "Last name must be at least 2 characters",
      "string.max": "Last name cannot exceed 100 characters",
    }),
    currency: Joi.string().optional().allow("", null),

    email: Joi.string().email().required().messages({
      "string.empty": "Email is required",
      "string.email": "Email must be a valid email address",
    }),

    phone: Joi.string()
      .pattern(/^[0-9]{7,15}$/)
      .required()
      .messages({
        "string.empty": "Phone number is required",
        "string.pattern.base": "Phone number must be 7 to 15 digits",
      }),

    address: Joi.object({
      address_line_1: Joi.string().min(3).max(255).required().messages({
        "string.empty": "Address Line 1 is required",
        "string.min": "Address must be at least 3 characters",
        "string.max": "Address cannot exceed 255 characters",
      }),

      address_line_2: Joi.string().allow("").max(255).messages({
        "string.max": "Address Line 2 cannot exceed 255 characters",
      }),

      city: Joi.string().min(2).max(100).required().messages({
        "string.empty": "City is required",
        "string.min": "City must be at least 2 characters",
        "string.max": "City cannot exceed 100 characters",
      }),

      state: Joi.string().min(2).max(100).required().messages({
        "string.empty": "State is required",
        "string.min": "State must be at least 2 characters",
        "string.max": "State cannot exceed 100 characters",
      }),

      country: Joi.string().min(2).max(100).required().messages({
        "string.empty": "Country is required",
        "string.min": "Country must be at least 2 characters",
        "string.max": "Country cannot exceed 100 characters",
      }),

      postcode: Joi.string()
        .pattern(/^[0-9]{4,10}$/)
        .required()
        .messages({
          "string.empty": "Postcode is required",
          "string.pattern.base": "Postcode must be between 4 to 10 digits",
        }),
      land_mark: Joi.string().max(255).optional().allow("").messages({
        "string.max": "Landmark cannot exceed 255 characters",
      }),
    })
      .required()
      .messages({
        "object.base": "Address must be provided",
      }),

    payment_method: Joi.string().valid("cod", "razorpay").required().messages({
      "any.only": "Payment method must be either 'cod' or 'razorpay'",
      "string.empty": "Payment method is required",
    }),

    note: Joi.string().max(500).optional().allow("").messages({
      "string.max": "Note cannot exceed 500 characters",
    }),
  }),
});
