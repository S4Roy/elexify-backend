import { resolvePincode } from "../../../services/shipping/resolvePincode.js";
import { StatusError } from "../../../config/index.js";

// Address-form auto-fill: given a 6-digit pincode, resolve city/state/country
// and whether we currently service it.
export const pincodeLookup = async (req, res, next) => {
  try {
    const { pincode } = req.params;

    if (!/^\d{6}$/.test(pincode)) {
      throw StatusError.badRequest("Enter a valid 6-digit pincode");
    }

    const data = await resolvePincode(pincode);

    res.status(200).json({
      status: "success",
      message: data.found
        ? data.serviceable
          ? "Pincode resolved"
          : "Pincode is not currently serviceable"
        : "Pincode not found",
      data,
    });
  } catch (error) {
    next(error);
  }
};
