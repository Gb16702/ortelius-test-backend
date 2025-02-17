import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "@errors/AppError";
import dotenv from "dotenv";
import { User } from "@models/userSchema";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;
const COOKIE_NAME = "auth_token";

export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.COOKIE_NAME;
    if (!token) {
      throw AppError.unauthorized("Unauthorized: No token provided");
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      throw AppError.unauthorized("Unauthorized: User not found");
    }

    (req as any).user = user;
    next();
  } catch (error) {
    next(AppError.unauthorized("Unauthorized: Invalid token"));
  }
};
