import multer from "multer";
import multerS3 from "multer-s3";
import { awsService } from "../services/index.js";
import { envs } from "../config/index.js";

const s3 = new awsService.AWS.S3();
const bucketName = envs.s3.BUCKET_NAME;

const storage = multerS3({
  s3: s3,
  acl: "public-read",
  contentType: multerS3.AUTO_CONTENT_TYPE,
  bucket: function (req, file, cb) {
    let directory = `${bucketName}/uploads/user/profile_image/original`;
    if (req.body.user_id) {
      directory = `${bucketName}/uploads/user/${req.body.user_id}/profile_image/original`;
    }
    cb(null, directory);
  },
  key: function (req, file, cb) {
    const fileName = file.originalname.split(".").shift();
    const timestamp = Date.now();
    const randomNumbers = Math.floor(100000 + Math.random() * 900000);
    const originalName = file.originalname;
    const extension = originalName.slice(originalName.lastIndexOf("."));
    const newFileName = `${fileName}-${randomNumbers}-${timestamp}${extension}`;
    cb(null, newFileName);
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === "image/jpg" ||
    file.mimetype === "image/jpeg" ||
    file.mimetype === "image/png"
  ) {
    cb(null, true);
  } else {
    return cb({ code: "LIMIT_FILE_TYPE" });
  }
};

const userImageUpload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 25 },
  fileFilter: fileFilter,
});
export { userImageUpload };
