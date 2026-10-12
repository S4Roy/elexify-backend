import User from "../../../models/User.js";

// Options for the customer list's State / City filters: the areas customers
// were last seen in, with counts (see services/location/customerLocation.js).
export const locationAreas = async (req, res, next) => {
  try {
    const rows = await User.aggregate([
      { $match: { deleted_at: null, role: "customer", "last_location.recorded_at": { $type: "date" }, "last_location.state": { $nin: [null, ""] } } },
      { $group: { _id: { state: "$last_location.state", city: "$last_location.city" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1000 },
    ]);
    const states = new Map();
    for (const { _id, count } of rows) {
      const entry = states.get(_id.state) || { state: _id.state, count: 0, cities: [] };
      entry.count += count;
      if (_id.city) entry.cities.push({ city: _id.city, count });
      states.set(_id.state, entry);
    }
    const data = [...states.values()]
      .map((s) => ({ ...s, cities: s.cities.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)) }))
      .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};
