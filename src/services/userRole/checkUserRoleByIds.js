// import model from "../../models/index.js";

// /*
//  * checkUserRoleByIds
//  * check the user role by user id role id in array
//  * return boolean
//  */
// export const checkUserRoleByIds = async (userId, roleId) => {
//   let returnStr = false;
//   const result = await model.userRole.findOne({
//     include: [
//       {
//         model: model.user,
//         attributes: ["id"],
//         where: { status: "active" },
//         required: true,
//       },
//       {
//         model: model.role,
//         attributes: ["id", "role_name"],
//         where: { status: "active" },
//         required: true,
//       },
//     ],
//     where: { status: "active", user_id: userId, role_id: roleId },
//   });
//   if (result && result != null && result != "undefined") {
//     returnStr = true;
//   }

//   return returnStr;
// };
