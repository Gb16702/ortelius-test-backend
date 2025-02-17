import multer, { Multer } from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";

const uploadPath = path.join(__dirname, "../uploads/audio");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const allowedExtensions = [".flac", ".m4a", ".mp3", ".mp4", ".mpeg", ".mpga", ".oga", ".ogg", ".wav", ".webm"];
const allowedMimeTypes = ["audio/mpeg", "audio/wav", "audio/webm", "audio/ogg"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const finalExtension = allowedExtensions.includes(extension) ? extension : ".webm";

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${finalExtension}`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: any) => {
  const extension = path.extname(file.originalname).toLowerCase();
  console.log(file.mimetype);
  console.log(extension);
  console.log(file.originalname);
  console.log(allowedExtensions.includes(extension));


  if (!allowedExtensions.includes(extension) || !allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export default upload;
