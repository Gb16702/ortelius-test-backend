import mongoose from "mongoose";
import dotenv from "dotenv";
import bcryptjs from "bcryptjs";
import { User } from "../models/userSchema";

dotenv.config();

const MONGO_DB_URI = process.env.MONGO_DB_URI as string;

const seedUser = async () => {
  try {
    const existingUser = await User.findOne({ email: process.env?.ADMIN_EMAIL });
    if (existingUser) {
      console.log("User already exists");
      process.exit(0);
    }

    const hashedPassword = await bcryptjs.hash(process?.env.ADMIN_PASSWD as string, 10);

    const user = new User({
      username: "Geoffrey",
      email: process.env?.ADMIN_EMAIL,
      password: hashedPassword,
      tokens: 1000,
    });

    await user.save();
    console.log("Successfully inserted user into database : ", user);

    process.exit(0);
  } catch (error) {
    console.error("An error occured while trying to insert user : ", error);
    process.exit(1);
  }
};

seedUser();
