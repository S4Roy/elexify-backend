import Address from "../../../models/Address.js";
import { StatusError } from "../../../config/index.js";

/**
 * Edit Address
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const {
      _id,
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

    const address = await Address.findOne({
      _id,
      user: user_id,
      deleted_at: null,
    });

    if (!address) throw StatusError.notFound("Address not found");

    // Unset other default addresses
    if (is_default) {
      await Address.updateMany(
        { user: user_id, deleted_at: null, _id: { $ne: _id } },
        { is_default: false }
      );
    }

    if (first_name !== undefined) address.first_name = first_name;
    if (last_name !== undefined) address.last_name = last_name;

    if (first_name !== undefined && last_name !== undefined) {
      address.full_name = `${first_name} ${last_name}`;
    }
    if (phone_code !== undefined) address.phone_code = phone_code;
    if (phone !== undefined) address.phone = phone;
    if (email !== undefined) address.email = email;
    if (address_line_1 !== undefined) address.address_line_1 = address_line_1;
    if (address_line_2 !== undefined) address.address_line_2 = address_line_2;
    if (land_mark !== undefined) address.land_mark = land_mark;
    if (city !== undefined) address.city = city;
    if (state !== undefined) address.state = state;
    if (country !== undefined) address.country = country;
    if (postcode !== undefined) address.postcode = postcode;
    if (address_type !== undefined) address.address_type = address_type;
    if (purpose !== undefined) address.purpose = purpose;
    if (typeof is_default === "boolean") address.is_default = is_default;

    address.updated_by = user_id;
    address.updated_at = Date.now();

    await address.save();

    res.status(200).json({
      status: "success",
      message: req.__("Address updated successfully"),
      data: address,
    });
  } catch (error) {
    next(error);
  }
};
