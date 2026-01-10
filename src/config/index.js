import { envs } from "./envs.js";
import { handleError } from "./handleErrors.js";
import { StatusError } from "./StatusErrors.js";
import { StatusSuccess } from "./StatusSuccess.js";
// // import { connect, sequelize, connectDb1, sequelizeDb1 } from "./database.js";
// import mongoose from "./moongose.js";
import { logger, morganConf } from "./logger.js";

export {
  envs,
  handleError,
  StatusError,
  logger,
  morganConf,
  StatusSuccess,
  //   mongoose,
};
