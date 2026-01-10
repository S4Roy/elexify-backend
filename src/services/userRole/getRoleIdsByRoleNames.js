// import model from "../../models/index.js";
// import { Op } from "sequelize";

// /*
//  * getRoleIdsByRoleNames
//  * get the user role ids by names
//  * return object array
//  */
// export const getRoleIdsByRoleNames = async (roles, returnType, status = null) => {
//   let returnArr = [];
//   let condition = { role_name: { [Op.in]: roles } };
//   if (status) {
//     condition.status = status;
//   } else {
//     condition.status = { [Op.ne]: "deleted" };
//   }
//   const results = await model.role.findAll({
//     attributes: ["id", "role_name"],
//     where: condition,
//   });
//   if (results && results != null && results != "undefined" && results.length > 0) {
//     if (returnType == "ids") {
//       returnArr = results.map((record) => {
//         return record.id;
//       });
//     } else {
//       returnArr = results;
//     }
//   }

//   return returnArr;
// };
