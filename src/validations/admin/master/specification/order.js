import { celebrate, Joi } from "celebrate";

/**
 * Validator for bulk sort-order update:
 * Expects body: { items: [ { _id: "<mongoId>", sortOrder: 1 }, ... ] }
 */
export const order = celebrate({
  body: Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          // Validate MongoDB ObjectId (24 hex chars). If you also accept non-ObjectId strings,
          // change to Joi.string().trim().min(1).max(100) and adjust messages accordingly.
          _id: Joi.string().trim().length(24).hex().required().messages({
            "string.base": "_id must be a string",
            "string.empty": "_id cannot be empty",
            "string.length": "_id must be 24 characters (Mongo ObjectId)",
            "string.hex": "_id must be a valid hex string",
            "any.required": "_id is required for each item",
          }),

          // sort_order: integer >= 0 (change min if you allow negatives)
          sort_order: Joi.number().integer().min(0).required().messages({
            "number.base": "sort_order must be a number",
            "number.integer": "sort_order must be an integer",
            "number.min": "sort_order must be at least 0",
            "any.required": "sort_order is required for each item",
          }),
        }).messages({
          "object.base": "Each item must be an object with _id and sort_order",
        })
      )
      .min(1)
      .required()
      .messages({
        "array.base": "Items must be an array",
        "array.min": "Items must have at least one entry",
        "any.required": "Items are required",
      }),
  }),
});
