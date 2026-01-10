import Address from "../../../models/Address.js";
import { StatusError } from "../../../config/index.js";

/**
 * Add Address
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const {
      first_name,
      last_name,
      phone_code,
      phone,
      email,
      address_line_1,
      address_line_2,
      land_mark,
      city,
      state,
      country,
      postcode,
      address_type,
      purpose,
      is_default,
    } = req.body;

    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");
    const addressFilter = {
      user: user_id,
      user: user_id,
      full_name: `${first_name} ${last_name}`,
      phone_code,
      phone,
      email: email || null,
      address_line_1,
      address_line_2: address_line_2 || null,
      land_mark: land_mark || null,
      city,
      state,
      country: country || 101,
      postcode,
      address_type: address_type || "residential",
    };

    let addressExist = await Address.findOne(addressFilter);
    if (addressExist) {
      throw StatusError.badRequest("Address already exist");
    }
    // If is_default is true, unset others
    if (is_default) {
      await Address.updateMany(
        { user: user_id, deleted_at: null },
        { is_default: false }
      );
    }

    const address = new Address({
      user: user_id,
      full_name: `${first_name} ${last_name}`,
      phone_code,
      phone,
      email: email || null,
      address_line_1,
      address_line_2: address_line_2 || null,
      land_mark: land_mark || null,
      city,
      state,
      country: country || 101,
      postcode,
      address_type: address_type || "residential",
      purpose: purpose || "shipping",
      is_default: is_default || false,
      created_by: user_id,
      created_at: Date.now(),
    });

    await address.save();

    res.status(201).json({
      status: "success",
      message: req.__("Address added successfully"),
      data: address,
    });
  } catch (error) {
    next(error);
  }
};
