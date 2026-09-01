import { StatusError } from "../../../config/index.js";
import { getOperation } from "../../../scripts/seeders/registry/index.js";
import { execute } from "../../../scripts/runner.js";
import { OperationError } from "../../../scripts/shared/errors.js";

export const dryRun = async (req, res, next) => {
  try {
    const entry = getOperation(req.params.key);
    if (!entry) throw StatusError.notFound(req.__("Operation not found"));
    if (!entry.supportsDryRun) throw StatusError.badRequest(req.__("This operation does not support a dry run."));

    const outcome = await execute(req.params.key, {
      dryRun: true,
      triggerSource: "ADMIN",
      triggeredBy: req.auth?.user_id,
    });

    res.status(200).json({ status: "success", message: req.__("Dry run complete"), data: outcome });
  } catch (error) {
    if (error instanceof OperationError) return next(new StatusError(error.statusCode, error.message));
    next(error);
  }
};
