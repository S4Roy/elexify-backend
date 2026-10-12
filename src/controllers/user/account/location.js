import { recordCustomerLocation } from "../../../services/location/customerLocation.js";

// The app reports the customer's location (see services/location/customerLocation.js).
export const updateLocation = async (req, res, next) => {
  try {
    const { location, updated } = await recordCustomerLocation({
      userId: req.auth.user_id, latitude: req.body.latitude, longitude: req.body.longitude,
      accuracy: req.body.accuracy, precise: req.body.precise,
    });
    res.status(200).json({
      status: "success",
      data: { updated, pincode: location.pincode, city: location.city, state: location.state, serviceable: !!location.serviceable },
    });
  } catch (error) {
    next(error);
  }
};
