// import model from "../../models/index.js";

/*
 * getUserRole
 * get the user role by user id
 * return object
 */
export const getUserRole = async (userId) => {
  let returnStr = {};
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
  //     where: { status: "active", user_id: userId },
  //   });
  //   if (result && result != null && result != "undefined") {
  //     returnStr = { role_id: result.role_id, role_name: result.role.role_name };
  //   }

  return returnStr;
};
