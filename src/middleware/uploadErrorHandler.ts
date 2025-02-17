import { Request, Response, NextFunction, response } from "express";
import { AppError } from "@errors/AppError";
import multer from "multer";

export const multerErrorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return next(AppError.resourceExhausted("File size is too large. Maximum file size is 10MB"));

      case "LIMIT_UNEXPECTED_FILE":
        return next(AppError.badRequest("Invalid file type. Only audio files are allowed"));

      default:
        return next(AppError.badRequest(`Multer error : ${error.message}`));
    }
  }

  next(error);
};
