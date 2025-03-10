import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { User } from "../models/userSchema";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;
const COOKIE_NAME = "auth_token";
const COOKIE_EXPIRATION = 7 * 24 * 60 * 60 * 1000;

class UserController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        throw AppError.badRequest("Email and password are required");
      }

      const user = await User.findOne({ email });
      if (!user) {
        throw AppError.unauthorized("Email or password is incorrect");
      }

      const arePasswordsMatching = await bcryptjs.compare(password, user.password);
      if (!arePasswordsMatching) {
        throw AppError.unauthorized("Email or password is incorrect");
      }

      const token = jwt.sign(
        {
          id: user.id,
        },
        JWT_SECRET as string,
        { expiresIn: "7d" }
      );

      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: COOKIE_EXPIRATION,
      });

      res.json({
        message: "User logged in successfully",
        user: {
          id: user.id,
          username: user.username,
          credits: user.credits,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response) {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.json({ message: "User logged out successfully" });
  }
}

export default new UserController();
