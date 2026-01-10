// import model from "../../models/index.js";
// import { Op } from "sequelize";

// /*
//  * checkUserRole
//  * check the user role by user id role key in array
//  * return boolean
//  */
// export const checkUserRole = async (userId, role) => {
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
//         where: { status: "active", role_name: { [Op.in]: role } },
//         required: true,
//       },
//     ],
//     where: { status: "active", user_id: userId },
//   });
//   if (result && result != null && result != "undefined") {
//     returnStr = true;
//   }

//   return returnStr;
// };
