import { Router } from "express";
import { Joi, celebrate, Segments } from "celebrate";
import * as controller from "../../controllers/admin/integrationCredentials/index.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";

const integrationCredentialsRouter = Router();
const guard = requirePermission(PERMISSIONS.INTEGRATION_CREDENTIAL_MANAGE);
integrationCredentialsRouter.get("/", guard, controller.list);
integrationCredentialsRouter.put("/:provider", guard, celebrate({
  [Segments.PARAMS]: Joi.object({ provider: Joi.string().trim().lowercase().required() }),
  [Segments.BODY]: Joi.object({ enabled: Joi.boolean(), credentials: Joi.object().pattern(Joi.string(), Joi.string().allow("").max(4096)) }).min(1),
}), controller.update);
integrationCredentialsRouter.post("/:provider/test", guard, controller.test);
integrationCredentialsRouter.delete("/:provider", guard, celebrate({
  [Segments.BODY]: Joi.object({ reason: Joi.string().trim().min(10).max(500).required() }),
}), controller.clear);

export { integrationCredentialsRouter };
