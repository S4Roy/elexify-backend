import * as userService from "./user/index.js";
import * as emailTemplateService from "./emailTemplate/index.js";
import * as emailService from "./email/index.js";
// import * as paginationService from "./pagination/index.js";
// import * as primaryIdByUuidService from "./primaryIdByUuid/index.js";
import * as awsService from "./awsService/index.js";
import * as s3HandlerService from "./s3Handler/index.js";
import * as userRoleService from "./userRole/index.js";
import * as inventoryService from "./inventory/index.js";
import * as paymentService from "./paymentService/index.js";
import * as shiprocket from "./shiprocket/index.js";
import * as zohoService from "./zoho/index.js";

export {
  userService,
  userRoleService,
  emailService,
  emailTemplateService,
  awsService,
  s3HandlerService,
  inventoryService,
  paymentService,
  shiprocket,
  zohoService,
};
