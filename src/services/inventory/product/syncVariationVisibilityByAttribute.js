import ProductVariation from "../../../models/ProductVariation.js";
import Attribute from "../../../models/Attribute.js";
import AttributeValue from "../../../models/AttributeValue.js";
/**
 * syncVariationVisibilityByAttribute
 * @param details
 */
export const syncVariationVisibilityByAttribute = async (attributeId) => {
  try {
    // 1) Read attribute visibility
    const attributeDoc = await Attribute.findById(attributeId)
      .select("visible_in_list")
      .lean();
    const attributeVisible = attributeDoc
      ? !!attributeDoc.visible_in_list
      : false;

    // 2) Read all attribute values for this attribute (include soft-deleted values so we can treat them as invisible)
    // We'll build a map of valueId => visible_in_list (boolean)
    const attrValues = await AttributeValue.find({
      attribute_id: attributeId,
      visible_in_list: false,
    })
      .select("_id visible_in_list")
      .lean();
    for (const value of attrValues) {
      let variations = await ProductVariation.find({
        "attributes.value_id": value?._id,
      });
      for (const variation of variations) {
        const updateVariationVisibility =
          await ProductVariation.findByIdAndUpdate(variation?._id, {
            visible_in_list: value.visible_in_list,
          });
        console.log(updateVariationVisibility?.sku);
      }
    }
  } catch (err) {}
};
