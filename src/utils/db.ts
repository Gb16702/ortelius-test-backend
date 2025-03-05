import mongoose, { ConnectOptions } from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_DB_URI = process.env.MONGO_DB_URI as string;

const connectToDatabase = async () => {
  try {
    if (!MONGO_DB_URI) {
      throw new Error("URI isn't provided");
    }

    await mongoose.connect(MONGO_DB_URI, {} as ConnectOptions);
    console.log("Successfully connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error :", error);
    process.exit(1);
  }
};

export default connectToDatabase;
