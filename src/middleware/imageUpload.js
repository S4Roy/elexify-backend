import multer from "multer";
import fs from "fs";
 
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let directory = req.body.draft_request_id
      ? `./public/uploads/temp/${req.body.draft_request_id}/images/original`
      : req.body.title_id
      ? `./public/uploads/title/${req.body.title_id}/images/original`
      : `./public/uploads/temp/${req.body.draft_request_id}/images/original`;
 
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
 
    cb(null, directory);
  },
  filename: function (req, file, cb) {
    const uniqueSuffixName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    return cb(null, uniqueSuffixName + "-" + file.originalname);
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
const imageUpload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 25 },
  fileFilter: fileFilter,
});
 
export { imageUpload };
 
 