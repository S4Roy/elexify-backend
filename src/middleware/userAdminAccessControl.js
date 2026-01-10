import { StatusError } from "../config/index.js";
import { userRoleService } from "../services/index.js";

/**
 * This function is used for validating access control for admin end user
 * @param req
 * @param res
 * @param next
 */

export const userAdminAccessControl = (permission = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.userDetails.userId ? req.userDetails.userId : "";
      if (!userId) throw StatusError.unauthorized("");

      const userRoleId = req.userDetails.user_role_id ? req.userDetails.user_role_id : "";
      if (!userRoleId) throw StatusError.unauthorized("");

      const userType = req.userDetails.user_type ? req.userDetails.user_type : "";
      if (!userType) throw StatusError.unauthorized("");
      if (userType == "guests" || userType == "users") throw StatusError.unauthorized("");

      if (permission && permission.length > 0) {
        const checkRole = await userRoleService.checkUserRoleByIds(userId, userRoleId);
        if (!checkRole) throw StatusError.unauthorized("");
        // const checkPermission = await userPermissionService.checkPermission(userRoleId, permission);
        // if (!checkPermission) throw StatusError.unauthorized("");
        next();
      } else {
        throw StatusError.unauthorized("");
      }
    } catch (error) {
      next(error);
    }
  };
};
