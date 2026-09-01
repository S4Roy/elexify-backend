import { StatusError } from "../../../config/index.js";
import { getOperation } from "../../../scripts/seeders/registry/index.js";
import { currentEnvironment } from "../../../scripts/runner.js";

// Health status is computed entirely separately from execution status — a
// health check never mutates data, and "ran successfully once" is not the
// same claim as "the data is currently healthy" (an admin could have since
// deleted the seeded rows by hand).
export const health = async (req, res, next) => {
  try {
    const entry = getOperation(req.params.key);
    if (!entry) throw StatusError.notFound(req.__("Operation not found"));

    const environment = currentEnvironment();

    if (typeof entry.healthCheck !== "function") {
      return res.status(200).json({
        status: "success",
        message: req.__("Health check"),
        data: { key: entry.key, status: "NOT_APPLICABLE", detail: "This operation has no meaningful expected-vs-actual health signal." },
      });
    }

    const health = await entry.healthCheck({ environment });
    res.status(200).json({ status: "success", message: req.__("Health check"), data: { key: entry.key, ...health } });
  } catch (error) {
    next(error);
  }
};
