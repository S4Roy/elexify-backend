import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    name: Joi.string().min(2).max(100).required(),

    product_type: Joi.string().valid("simple", "variable").required(),

    description: Joi.string().max(50000).optional().allow(""),
    short_description: Joi.string().max(1000).optional().allow(""),
    rarity: Joi.string().optional().allow(null, ""),

    brand: Joi.string().optional().allow(null, ""),
    category: Joi.array().items(Joi.string()).optional(),
    sub_category: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    classifications: Joi.array().items(Joi.string()).optional(),
    ask_for_price: Joi.boolean().optional().allow(null, ""),
    enable_enquiry: Joi.boolean().optional().allow(null, ""),
    status: Joi.string().valid("active", "inactive").default("active"),

    images: Joi.array()
      .items(
        Joi.object({
          _id: Joi.string().optional(),
          sort_order: Joi.number().allow(null),
          alt_text: Joi.string().optional().allow(""),
          type: Joi.string().optional().allow(""),
          mime_type: Joi.string().optional().allow(""),
          size: Joi.string().optional().allow(""),
          thumbnail: Joi.string().optional().allow(""),
          is_primary: Joi.boolean().optional(),
          created_at: Joi.date().optional(),
          url: Joi.string().uri().required(),
        })
      )
      .optional(),

    meta_title: Joi.string().max(255).optional().allow("", null),
    meta_description: Joi.string().max(1000).optional().allow("", null),
    meta_keywords: Joi.string().optional().allow("", null),

    power_level: Joi.number().optional().allow(null),
    // Physical attributes (nullable number fields)
    weight: Joi.number().optional().allow(null),
    length: Joi.number().optional().allow(null),
    width: Joi.number().optional().allow(null),
    height: Joi.number().optional().allow(null),
    shipping_class: Joi.string().optional().allow(null, ""),

    // Pricing (for simple product, nullable for variable)
    regular_price: Joi.number().optional().allow(null),
    sale_price: Joi.number().optional().allow(null),
    sale_start_date: Joi.date().optional().allow(null),
    sale_end_date: Joi.date().optional().allow(null),
    sku: Joi.string().optional().allow(null),
    stock_status: Joi.string()
      .valid("in_stock", "out_of_stock")
      .optional()
      .allow(null),
    stock_quantity: Joi.number().optional().allow(null),

    allow_backorders: Joi.boolean().optional(),
    manage_stock: Joi.boolean().optional(),
    sold_individually: Joi.boolean().optional(),

    variations: Joi.array()
      .items(
        Joi.object({
          attributes: Joi.array()
            .items(
              Joi.object({
                attribute_id: Joi.string().required(),
                value_id: Joi.string().required(),
                attribute_name: Joi.string().optional().allow(""),
                value_name: Joi.string().optional().allow(""),
              })
            )
            .required(),

          variant_name: Joi.string().optional().allow(null, ""),
          visible_in_list: Joi.boolean().optional().allow(null, ""),
          ask_for_price: Joi.boolean().optional().allow(null, ""),
          enable_enquiry: Joi.boolean().optional().allow(null, ""),
          power_level: Joi.number().optional().allow(null, ""),
          weight: Joi.number().optional().allow(null, ""),
          length: Joi.number().optional().allow(null, ""),
          width: Joi.number().optional().allow(null, ""),
          height: Joi.number().optional().allow(null, ""),
          shipping_class: Joi.string().optional().allow(null, ""),

          regular_price: Joi.number().required(),
          sale_price: Joi.number().optional().allow(null),
          sale_start_date: Joi.date().optional().allow(null),
          sale_end_date: Joi.date().optional().allow(null),
          sku: Joi.string().required(),
          stock_status: Joi.string()
            .valid("in_stock", "out_of_stock")
            .required(),
          stock_quantity: Joi.number().required(),
          _id: Joi.string().optional().allow(null, ""),
          rarity: Joi.string().optional().allow(null, ""),

          images: Joi.array()
            .items(
              Joi.object({
                _id: Joi.string().optional(),
                sort_order: Joi.number().allow(null),
                type: Joi.string().optional().allow(""),
                mime_type: Joi.string().optional().allow(""),
                size: Joi.string().optional().allow(""),
                thumbnail: Joi.string().optional().allow(""),
                alt_text: Joi.string().optional().allow(""),
                is_primary: Joi.boolean().optional(),
                created_at: Joi.date().optional(),
                url: Joi.string().uri().required(),
              })
            )
            .optional(),
        })
      )
      .optional(),

    attributes: Joi.array()
      .items(
        Joi.object({
          attribute: Joi.string().required(),
          attribute_name: Joi.string().required(),
          attribute_description: Joi.string().optional().allow(""),
          values: Joi.array().items(Joi.string()).required(),
          visible_in_list: Joi.boolean().optional().allow(null, ""),
        })
      )
      .optional(),
    specifications: Joi.array()
      .items(
        Joi.object({
          specification_id: Joi.string().required(),
          key: Joi.string().optional().allow(null, ""),
          type: Joi.string().optional().allow(null, ""),
          visible: Joi.string().optional().allow(null, ""),
          required: Joi.string().optional().allow(null, ""),
          label: Joi.string().optional().allow(null, ""),
          value: Joi.string().optional().allow(null, ""),
        })
      )
      .optional(),
  }),
});
