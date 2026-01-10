import { StatusError } from "../../config/index.js";
function customFileUpload(multerUploadFunction) {
  return (req, res, next) =>
    multerUploadFunction(req, res, (err) => {
      // handle Multer error      
      if (err && err.name && err.name === "MulterError") {
        throw StatusError.badRequest("MulterError");
      }
      // handle other errors
      if (err) {
        throw StatusError.badRequest("fileUploadError");
      }
      next();
    });
}
export { customFileUpload };
