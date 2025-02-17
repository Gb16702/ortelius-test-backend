import mongoose, { ConnectOptions } from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_DB_URI = process.env.MONGO_DB_URI as string;

mongoose
  .connect(MONGO_DB_URI, {} as ConnectOptions)
  .then(() => console.log("Successfully connected to MongoDB"))
  .catch(err => console.error("Error while trying to connect MongoDB : ", err));


mongoose.connection.on("error", err => {
  console.error("An error occured while trying to connect to MongoDB : ", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

export default mongoose;
