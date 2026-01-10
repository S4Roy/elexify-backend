// import model from "../../models/index.js";
// import { Op } from "sequelize";

// /*
//  * getRoleIdByRoleName
//  * get the user role id by name
//  * return int (role id)
//  */
// export const getRoleIdByRoleName = async (role, status = null) => {
//   let returnStr = null;
//   let condition = { role_name: role };
//   if (status) {
//     condition.status = status;
//   } else {
//     condition.status = { [Op.ne]: "deleted" };
//   }
//   const result = await model.role.findOne({
//     attributes: ["id"],
//     where: condition,
//   });
//   if (result && result != null && result != "undefined") {
//     returnStr = result.id;
//   }

//   return returnStr;
// };
