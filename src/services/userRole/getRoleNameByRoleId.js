// import model from "../../models/index.js";
// import { Op } from "sequelize";

// /*
//  * getRoleNameByRoleId
//  * get the user role name by role id
//  * return string (role name)
//  */
// export const getRoleNameByRoleId = async (roleId, status = null) => {
//   let returnStr = null;
//   if (roleId) {
//     let condition = { id: roleId };
//     if (status) {
//       condition.status = status;
//     } else {
//       condition.status = { [Op.ne]: "deleted" };
//     }
//     const result = await model.role.findOne({
//       attributes: ["role_name"],
//       where: condition,
//     });
//     if (result && result != null && result != "undefined") {
//       returnStr = result.role_name;
//     }
//   }

//   return returnStr;
// };
